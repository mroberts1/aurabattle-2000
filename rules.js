// AURABATTLE 2000 - rules engine
// Pure functions, no DOM. Runs in the browser and in Node (sim.js).
// All numbers here are first guesses; sim.js exists to tune them.
(function (root) {
  'use strict';
  const R = {};

  R.START_AURA = 10;
  R.MAX_AURA = 10;
  R.TURN_TIME = 20;        // seconds to pick a move
  R.CHAMP_RECOVER = 3;     // aura the winner gets back between battles
  R.MOVES = ['pose', 'hold', 'clown', 'stare', 'farm', 'clip'];

  R.MOVE_INFO = {
    pose:  { label: 'Pose',       hint: 'Steady hype. Cracks if Clowned. Beats Stare Down.' },
    hold:  { label: 'Hold',       hint: 'Stone face. Clown bounces off. Stare Down breaks it. Idle twice = NPC.' },
    clown: { label: 'Clown',      hint: 'Make them crack. Falls flat against Hold.' },
    stare: { label: 'Stare Down', hint: 'Breaks a Hold. Loses to a Pose.' },
    farm:  { label: 'Farm',       hint: 'Slow walk, shades on: +2 aura. Cracks if Clowned.', uses: 3 },
    clip:  { label: 'Clip Farm',  hint: 'Play to the phones. If the ring ignores you, -3 aura.', uses: 2 },
  };

  // base impression each move makes on the crowd
  R.BASE = { pose: 2, hold: 1, clown: 1, stare: 1, farm: 0, clip: 3, hesitate: -1 };

  R.newBattler = (id, name) => ({
    id, name, aura: R.START_AURA, farms: 3, clips: 2, idleHolds: 0, wins: 0, lastMove: null,
  });

  R.legalMoves = (b) => R.MOVES.filter(m =>
    !(m === 'farm' && b.farms <= 0) && !(m === 'clip' && b.clips <= 0));

  function mk(move) {
    return { move, imp: R.BASE[move], cracked: false, npc: false, aura: 0, tags: [] };
  }

  // effect of X's move on Y
  function act(X, Y) {
    if (X.move === 'clown') {
      if (Y.move === 'hold') { X.imp = -1; Y.imp += 1; X.tags.push('flat'); Y.tags.push('unbothered'); }
      else if (['pose', 'farm', 'clip', 'hesitate'].includes(Y.move)) {
        Y.cracked = true; X.imp += 1; X.tags.push('landed');
      }
      else if (Y.move === 'stare') { X.imp = 0; Y.imp += 1; Y.tags.push('unmoved'); }
    }
    if (X.move === 'stare') {
      if (Y.move === 'hold') { Y.imp = -1; Y.tags.push('broken'); X.imp += 2; X.tags.push('broke'); }
      else if (Y.move === 'pose') { X.imp = 0; Y.imp += 1; Y.tags.push('outposed'); }
    }
  }

  // Step 1: the clash. Both moves are revealed together.
  R.clash = function (a, b, ma, mb) {
    const A = mk(ma), B = mk(mb);
    act(A, B); act(B, A);
    for (const [S, me, them] of [[A, a, B], [B, b, A]]) {
      if (S.cracked) { S.imp -= 3; S.aura -= 1; S.tags.push('cracked'); }
      if (S.move === 'farm' && !S.cracked) { S.aura += 2; S.tags.push('farmed'); }
      if (S.move === 'hesitate') { S.aura -= 1; S.tags.push('hesitated'); }
      const attacked = them.move === 'clown' || them.move === 'stare';
      if (S.move === 'hold' && !attacked) {
        if (me.idleHolds >= 1) { S.npc = true; S.imp = -2; S.aura -= 1; S.tags.push('npc'); }
      }
    }
    return [A, B];
  };

  // Crowd member tastes. Most of the ring rewards composure (CNN: the calm one won).
  R.makeTaste = function (rng) {
    const hypeFan = rng() < 0.3;
    return {
      composure: hypeFan ? 0.2 + rng() * 0.3 : 0.6 + rng() * 0.4,
      hype: hypeFan ? 0.7 + rng() * 0.3 : 0.1 + rng() * 0.4,
      fav: null,          // 'A' | 'B' | null, a friend on stage
    };
  };

  function gauss(rng) { return (rng() + rng() + rng() - 1.5) * 1.15; }

  function appeal(S, t) {
    let v = S.imp;
    if ((S.move === 'pose' || S.move === 'hold') && !S.cracked && !S.npc && !S.tags.includes('broken'))
      v += t.composure * 1.5;
    if (S.move === 'farm' && !S.cracked) v += t.composure * 1.0;
    if (S.move === 'clip') v += t.hype * 3 - t.composure * 2.5;
    if (S.tags.includes('landed')) v += t.hype * 1.5;
    if (S.cracked) v -= t.composure * 2;
    return v;
  }

  // Step 2: each ring member votes 'A', 'B' or null (gives nothing)
  // lean > 0 favours A. |lean| < R.DECIDE means "gives nothing" (unless swept along)
  R.DECIDE = 0.7;
  R.crowdLean = function (taste, A, B, rng) {
    let d = appeal(A, taste) - appeal(B, taste) + gauss(rng);
    if (taste.fav === 'A') d += 0.8;
    if (taste.fav === 'B') d -= 0.8;
    return d;
  };
  R.crowdVote = function (taste, A, B, rng) {
    const d = R.crowdLean(taste, A, B, rng);
    if (Math.abs(d) < R.DECIDE) return null;
    return d > 0 ? 'A' : 'B';
  };

  // Step 3: votes decide the aura swing
  R.resolve = function (a, b, A, B, votes) {
    const n = votes.length || 1;
    const va = votes.filter(v => v === 'A').length;
    const vb = votes.filter(v => v === 'B').length;
    const res = { va, vb, none: votes.length - va - vb, winner: null, scenes: [] };
    const nm = { A: a.name, B: b.name };

    if (va !== vb) {
      res.winner = va > vb ? 'A' : 'B';
      const L = va > vb ? B : A;
      const margin = Math.abs(va - vb);
      L.aura -= Math.min(3, 1 + Math.floor(margin / 4));
    }
    // Clip Farm: the crowd decides whether it was aura or try-hard
    for (const [S, key, other] of [[A, 'A', B], [B, 'B', A]]) {
      if (S.move !== 'clip') continue;
      const mine = key === 'A' ? va : vb;
      if (mine < n / 3) { S.aura -= 3; S.tags.push('tryhard'); }
      else if (res.winner === key && mine >= n / 2) { other.aura -= 1; S.tags.push('viral'); }
    }

    // apply
    for (const [S, me] of [[A, a], [B, b]]) {
      me.aura = Math.max(0, Math.min(R.MAX_AURA, me.aura + S.aura));
      if (S.move === 'farm') me.farms--;
      if (S.move === 'clip') me.clips--;
      const attacked = (S === A ? B : A).move;
      me.idleHolds = (S.move === 'hold' && attacked !== 'clown' && attacked !== 'stare') ? me.idleHolds + 1 : 0;
      me.lastMove = S.move;
    }
    res.scenes = R.narrate(nm, A, B, res);
    return res;
  };

  const VERB = {
    pose: 'hit a pose', hold: 'held a stone face', clown: 'clowned', stare: 'locked a stare',
    farm: 'slow-walked in shades', clip: 'played to the phones', hesitate: 'froze up',
  };

  R.narrate = function (nm, A, B, res) {
    const out = [];
    const other = { A: 'B', B: 'A' };
    for (const [S, k] of [[A, 'A'], [B, 'B']]) {
      const me = nm[k], them = nm[other[k]];
      if (S.tags.includes('landed')) out.push(`${me} clowned and ${them} CRACKED UP.`);
      if (S.tags.includes('flat')) out.push(`${me} tried to clown ${them}, who didn't even blink.`);
      if (S.tags.includes('broke')) out.push(`${me}'s stare broke ${them}'s stone face.`);
      if (S.tags.includes('outposed')) out.push(`${me} posed straight through ${them}'s stare.`);
      if (S.tags.includes('unmoved')) out.push(`${me} stared down the clowning. Unmoved.`);
      if (S.tags.includes('farmed')) out.push(`${me} slow-walked, shades on. +2 aura.`);
      if (S.tags.includes('npc')) out.push(`${me} held still AGAIN for nothing. NPC behaviour. -1.`);
      if (S.tags.includes('hesitated')) out.push(`${me} hesitated. The ring saw it. -1.`);
      if (S.tags.includes('tryhard')) out.push(`${me} clip farmed and the ring gave nothing. Try-hard! -3.`);
      if (S.tags.includes('viral')) out.push(`${me}'s clip went viral. Phones everywhere.`);
    }
    if (!out.length) out.push(`${nm.A} ${VERB[A.move]}. ${nm.B} ${VERB[B.move]}.`);
    if (res.winner) out.push(`The ring went ${res.va}-${res.vb} for ${nm[res.winner]}.`);
    else out.push(`The ring split ${res.va}-${res.vb}. No one moved.`);
    return out;
  };

  // Bot battler: weighted random with simple reads of the opponent's last move
  R.botMove = function (me, opp, rng) {
    const w = { pose: 3, hold: 2, clown: 2.5, stare: 1.5, farm: 0, clip: 0 };
    if (me.farms > 0) w.farm = me.aura <= 5 ? 3 : (me.aura <= 8 ? 0.6 : 0);
    if (me.clips > 0) w.clip = me.aura >= 5 ? 0.9 : 0.3;
    if (opp.lastMove === 'hold') w.stare += 2.5;
    if (opp.lastMove === 'pose') w.clown += 2;
    if (opp.lastMove === 'clown') w.hold += 2.5;
    if (opp.lastMove === 'farm') w.clown += 1.5;
    if (me.idleHolds >= 1) w.hold = 0.2;
    const legal = R.legalMoves(me);
    let tot = 0; for (const m of legal) tot += w[m];
    let r = rng() * tot;
    for (const m of legal) { r -= w[m]; if (r <= 0) return m; }
    return legal[0];
  };

  R.rng = function (seed) { // mulberry32
    let s = seed >>> 0;
    return function () {
      s += 0x6D2B79F5; let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
  else root.Rules = R;
})(this);
