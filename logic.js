// Regras do jogo, sem nada de tela: dá para testar com `node logic.test.js`.

// as 12 eras dos álbuns de estúdio, em ordem: [xp mínimo, nome, cor 1, cor 2]
const ERAS = [
  [0, 'Taylor Swift', '#2f9479', '#1d5e4d'], [120, 'Fearless', '#c08f22', '#7f5b10'],
  [300, 'Speak Now', '#8e44ad', '#55246f'], [550, 'Red', '#c8102e', '#740818'],
  [850, '1989', '#3584c9', '#1b4f80'], [1250, 'reputation', '#55555f', '#1b1b20'],
  [1750, 'Lover', '#e0559c', '#6f86d6'], [2350, 'folklore', '#77787a', '#3e4042'],
  [3050, 'evermore', '#ad6234', '#5f3319'], [3900, 'Midnights', '#4b4fa3', '#1f2056'],
  [4900, 'The Tortured Poets Department', '#857e72', '#38352f'],
  [6100, 'The Life of a Showgirl', '#e0702a', '#23897a'],
];
const SIGNATURE = 'Lover'; // o look rosa fica liberado desde o começo
const XP = { task: 20, focus: 40, onTime: 60, late: 5, left: 10 };
const DEFAULT_CFG = { base: 10, max: 40, warn: 10, snooze: 3, focus: 25, smart: true };
const CFG_LIMITS = { base: [0, 120], max: [0, 180], warn: [1, 60], snooze: [1, 15], focus: [5, 180] };

const ACH = [
  ['soundcheck', 'Easter egg', 'Concluir a primeira faixa', 'ouro', s => s.tasksDone >= 1],
  ['pontual', 'Fearless', 'Chegar a tempo pela 1ª vez', 'ouro', s => s.onTime >= 1],
  ['ensaio', 'Long Pond Studio', '60 min no estúdio', 'ouro', s => s.focusMin >= 60],
  ['treze', 'Número 13', 'Concluir 13 faixas', 'platina', s => s.tasksDone >= 13],
  ['setlist', 'Surprise song', 'Fechar todas as faixas de um dia', 'platina', s => s.fullDays >= 1],
  ['pulseira', 'Pulseira da amizade', '7 dias seguidos de turnê', 'platina', s => s.streak >= 7],
  ['headliner', 'Mastermind', 'Chegar a tempo 10 vezes', 'diamante', s => s.onTime >= 10],
  ['maratona', 'From the Vault', '300 min no estúdio', 'diamante', s => s.focusMin >= 300],
  ['meio', 'Metade da turnê', 'Chegar à 6ª era', 'platina', s => lvl(s.xp).i >= 5],
  ['eras', 'The Eras Tour', 'Desbloquear as 12 eras', 'diamante', s => lvl(s.xp).i >= 11],
];

const QUOTES = ['Swiftie que é Swiftie chega antes da banda.', 'Cada faixa cumprida é um easter egg para o seu futuro.',
  'O camarim fecha na hora. O palco espera por você.', 'Ensaio feito, era desbloqueada.',
  'Pulseira no braço, agenda no lugar.', 'Uma faixa por vez. São doze eras pela frente.',
  'Quem respeita o horário vira headliner.', 'Hoje é dia de escrever o seu próprio álbum.',
  'Glitter no olho, foco na meta.', 'Atrasar? Só se for o bis.', 'Toda grande era começou com uma rotina simples.',
  'O número 13 dá sorte para quem cumpre a setlist.'];
const PHRASES = {
  ready: ['O camarim abriu. Uma era bem vivida começa com tempo de sobra.', 'Hora do glitter. Quem começa agora não corre depois.',
    'Fearless de verdade é levantar no primeiro alarme.', 'Troca de figurino em andamento. O palco não espera.'],
  warn: ['Falta pouco. Pulseiras no braço, bolsa no ombro.', 'Último ensaio: confira a bolsa e calce o sapato.',
    'O público já está entrando. A cortina está quase subindo.', 'Mastermind planeja a saída antes da hora.'],
  leave: ['Cortinas abrindo: é hora de sair!', 'Sair agora é o melhor easter egg que você pode deixar hoje.',
    'Headliner sai no horário. Porta, já!', 'A próxima era começa do outro lado da porta.'],
};
const STAGE = {
  ready: ['Camarim aberto', 'Comece a se arrumar para', 'Já estou me arrumando'],
  warn: ['Saída chegando', 'Bolsa pronta? Saída para', 'Estou quase pronta'],
  leave: ['Cortinas!', 'Hora de sair para', 'Estou saindo!'],
};
const ORDER = ['ready', 'warn', 'leave'];

function lvl(xp) {
  let i = 0;
  ERAS.forEach((e, k) => { if (xp >= e[0]) i = k; });
  return { i, cur: ERAS[i], next: ERAS[i + 1] };
}
const unlockedLooks = xp => ERAS.filter((e, i) => i <= lvl(xp).i || e[1] === SIGNATURE);

// folga = base + média dos atrasos dos últimos 5 compromissos (no horário conta 0), até o máximo
function smartBuffer(cfg, lateLog) {
  const l = lateLog.slice(-5);
  if (!cfg.smart || !l.length) return cfg.base;
  return Math.min(Math.max(cfg.max, cfg.base), cfg.base + Math.round(l.reduce((a, b) => a + b, 0) / l.length));
}

function times(ev, cfg, lateLog) {
  const at = new Date(ev.time);
  const leave = new Date(at - (ev.travel + smartBuffer(cfg, lateLog)) * 6e4);
  return { at, leave, warn: new Date(leave - cfg.warn * 6e4), ready: new Date(leave - ev.prep * 6e4) };
}

function clampCfg(key, raw, fallback) {
  const v = Math.round(Number(raw));
  if (raw === '' || isNaN(v)) return fallback;
  const [lo, hi] = CFG_LIMITS[key];
  return Math.min(hi, Math.max(lo, v));
}

const focusXP = min => Math.round(XP.focus * min / 25); // 40 XP a cada 25 min

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// virada de dia: metas diárias reiniciam, avulsas concluídas saem, sequência de dias atualiza
function rollDay(S, now = new Date()) {
  const today = dayKey(now);
  if (S.day === today) return S;
  const diff = Math.round((new Date(today) - new Date(S.day)) / 864e5);
  return {
    ...S, day: today, dayFull: false,
    stats: { ...S.stats, streak: diff === 1 ? S.stats.streak + 1 : 1 },
    tasks: S.tasks.filter(t => t.daily || !t.done).map(t => ({ ...t, done: false })),
  };
}

// soma XP e devolve o que mudou, para a tela comemorar
function gain(S, n) {
  const before = lvl(S.xp).i;
  const xp = S.xp + n;
  const stats = { ...S.stats, xp };
  const unlocked = { ...S.unlocked };
  const news = [];
  ACH.forEach(([id, name, , , test]) => { if (!unlocked[id] && test(stats)) { unlocked[id] = dayKey(); news.push(name); } });
  const newEra = lvl(xp).i > before ? lvl(xp).cur[1] : null;
  return { S: { ...S, xp, stats, unlocked }, newEra, news };
}

function sample(now = new Date()) {
  const d = new Date(now); d.setHours(d.getHours() + 3, 0, 0, 0);
  const id = () => Math.random().toString(36).slice(2, 9);
  return {
    xp: 0, day: dayKey(now), unlocked: {}, look: SIGNATURE, artist: '', photo: null, dayFull: false,
    cfg: { ...DEFAULT_CFG }, lateLog: [], myQuotes: [], focusEnd: null, focusLeft: null,
    bag: ['Chaves', 'Carteira e documentos', 'Celular carregado', 'Fone', 'Garrafinha de água'],
    stats: { tasksDone: 0, focusMin: 0, onTime: 0, late: 0, streak: 1, fullDays: 0, xp: 0 },
    tasks: [
      { id: id(), t: 'Revisar resumo (exemplo)', cat: 'Estudo', daily: true, done: false },
      { id: id(), t: 'Responder e-mails (exemplo)', cat: 'Trabalho', daily: false, done: false },
      { id: id(), t: 'Separar roupa de amanhã (exemplo)', cat: 'Organização', daily: true, done: false },
    ],
    events: [{ id: id(), title: 'Compromisso (exemplo)', time: d.toISOString(), prep: 40, travel: 20, status: null }],
  };
}

module.exports = { ERAS, SIGNATURE, XP, DEFAULT_CFG, CFG_LIMITS, ACH, QUOTES, PHRASES, STAGE, ORDER,
  lvl, unlockedLooks, smartBuffer, times, clampCfg, focusXP, dayKey, rollDay, gain, sample };
