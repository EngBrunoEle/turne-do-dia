import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable, Switch, Modal, Image, StyleSheet,
  KeyboardAvoidingView, Platform, useColorScheme, AppState, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  ERAS, SIGNATURE, XP, DEFAULT_CFG, ACH, QUOTES, PHRASES, STAGE, ORDER,
  lvl, unlockedLooks, smartBuffer, times, clampCfg, focusXP, dayKey, rollDay, gain, sample,
} from './logic';

const KEY = 'turne';
const uid = () => Math.random().toString(36).slice(2, 9);
const pick = a => a[Math.floor(Math.random() * a.length)];
const hm = d => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dur = ms => { const m = Math.round(Math.abs(ms) / 6e4); return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`; };

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

// Recria todos os alarmes a partir do estado: é mais simples e sempre correto depois de qualquer mudança.
// shortcut: iOS guarda no máximo 64 notificações agendadas; com 3–4 por ingresso dá ~16 ingressos futuros.
async function reschedule(S) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const now = Date.now();
  // alarm=true: no Android vai para o canal de alarme e usa setAlarmClock, que não atrasa para poupar bateria
  const at = (date, content, alarm = true) => Notifications.scheduleNotificationAsync({
    content: { sound: true, ...content }, // 'timeSensitive' exige permissão que conta Apple gratuita não tem
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: alarm ? 'alarmes' : 'avisos', ...(alarm && { delivery: 'alarmClock' }) },
  });
  for (const ev of S.events) {
    if (ev.status) continue;
    const tt = times(ev, S.cfg, S.lateLog);
    for (const k of ORDER) {
      if (tt[k] <= now) continue;
      await at(tt[k], {
        title: `${k === 'warn' ? `Faltam ${S.cfg.warn} min` : STAGE[k][0]} · ${ev.title}`,
        body: pick(PHRASES[k].concat(S.myQuotes)),
        categoryIdentifier: k === 'leave' ? 'leave' : 'alarm', data: { id: ev.id, k },
      });
    }
    if (ev.snooze && ev.snooze.at > now) {
      await at(new Date(ev.snooze.at), { title: `Soneca acabou · ${ev.title}`, body: pick(PHRASES[ev.snooze.k]), categoryIdentifier: 'alarm', data: { id: ev.id, k: ev.snooze.k } });
    }
    // ensaio de véspera: 20h do dia anterior para compromissos antes das 13h
    const eve = new Date(tt.at); eve.setDate(eve.getDate() - 1); eve.setHours(20, 0, 0, 0);
    if (tt.at.getHours() < 13 && eve > now) {
      await at(eve, { title: `Ensaio de véspera · ${ev.title}`, body: `Amanhã às ${hm(tt.at)}. Separe a roupa e deixe a bolsa pronta hoje.`, data: { id: ev.id, k: 'eve' } }, false);
    }
  }
  if (S.focusEnd && S.focusEnd > now) {
    await at(new Date(S.focusEnd), { title: 'Sessão gravada!', body: 'Pausa merecida. Volte ao estúdio quando estiver pronta.' }, false);
  }
}

export default function App() {
  const dark = useColorScheme() === 'dark';
  const [S, setS] = useState(null);
  const [, setTick] = useState(0);
  const [toast, setToast] = useState(null);
  const [alarm, setAlarm] = useState(null); // { id, k }
  const [editing, setEditing] = useState(null); // ingresso aberto no formulário
  const ref = useRef(null);
  ref.current = S;

  const show = msg => { setToast(msg); clearTimeout(show.t); show.t = setTimeout(() => setToast(null), 3000); };
  const update = fn => setS(prev => { const next = fn(prev); AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => show('Não deu para salvar no aparelho.')); return next; });
  const award = (prev, n, msg) => {
    const g = gain(prev, n);
    const extras = [g.newEra && `Bem-vinda à era ${g.newEra}!`, ...g.news.map(x => `Novo disco: ${x}`)].filter(Boolean);
    show([msg && `${msg} +${n} XP`, ...extras].filter(Boolean).join('\n'));
    return g.S;
  };
  // tocar na notificação abre a tela de alarme; os botões dela fazem soneca ou confirmam a saída
  const onResp = r => {
    Notifications.clearLastNotificationResponseAsync();
    const { id, k } = r.notification.request.content.data || {};
    if (!id || !ORDER.includes(k)) return;
    if (r.actionIdentifier === 'snooze') snooze(id, k);
    else if (r.actionIdentifier === 'ok') confirm(id, k);
    else setAlarm({ id, k });
  };

  // carregar
  useEffect(() => {
    AsyncStorage.getItem(KEY).then(raw => {
      let s = null;
      try { s = JSON.parse(raw); } catch {}
      s = s || sample();
      s = { ...sample(), ...s, cfg: { ...DEFAULT_CFG, ...s.cfg } };
      if (!unlockedLooks(s.xp).some(e => e[1] === s.look)) s.look = SIGNATURE;
      setS(rollDay(s));
      // app aberto pelo toque numa notificação quando estava fechado: o ouvinte abaixo ainda não existia
      return Notifications.getLastNotificationResponseAsync();
    }).then(r => r && onResp(r));
    (async () => {
      if (Platform.OS === 'android') { // o Android pede canal criado antes da permissão
        await Notifications.setNotificationChannelAsync('alarmes', {
          name: 'Alarmes de saída', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 400, 200, 400],
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM, contentType: Notifications.AndroidAudioContentType.SONIFICATION },
        });
        await Notifications.setNotificationChannelAsync('avisos', { name: 'Avisos', importance: Notifications.AndroidImportance.HIGH });
      }
      await Notifications.requestPermissionsAsync();
    })();
    Notifications.setNotificationCategoryAsync('alarm', [
      { identifier: 'snooze', buttonTitle: 'Soneca' }, { identifier: 'ok', buttonTitle: 'Estou indo' }]);
    Notifications.setNotificationCategoryAsync('leave', [{ identifier: 'ok', buttonTitle: 'Estou saindo!' }]);
  }, []);

  // alarmes: tocar na notificação ou recebê-la com o app aberto abre a tela de alarme
  useEffect(() => {
    const a = Notifications.addNotificationResponseReceivedListener(onResp);
    const b = Notifications.addNotificationReceivedListener(n => {
      const { id, k } = n.request.content.data || {};
      if (id && ORDER.includes(k)) setAlarm({ id, k });
    });
    return () => { a.remove(); b.remove(); };
  }, []);

  // reagendar quando algo que muda os horários mudar
  const sig = S && JSON.stringify([S.events, S.cfg, S.lateLog, S.focusEnd, S.myQuotes]);
  useEffect(() => { if (S) reschedule(S).catch(() => {}); }, [sig]);

  // relógio: contagens, fim do estúdio e virada de dia
  useEffect(() => {
    const iv = setInterval(() => {
      setTick(t => t + 1);
      const s = ref.current; if (!s) return;
      if (s.focusEnd && Date.now() >= s.focusEnd) {
        update(p => !p.focusEnd || Date.now() < p.focusEnd ? p : award({ ...p, focusEnd: null, focusLeft: null, stats: { ...p.stats, focusMin: p.stats.focusMin + p.cfg.focus } }, focusXP(p.cfg.focus), 'Sessão gravada!'));
      }
      if (s.day !== dayKey()) update(rollDay);
    }, 1000);
    const sub = AppState.addEventListener('change', st => { if (st === 'active') setTick(t => t + 1); });
    return () => { clearInterval(iv); sub.remove(); };
  }, []);

  function snooze(id, k) {
    update(p => ({ ...p, events: p.events.map(e => e.id === id ? { ...e, snooze: { at: Date.now() + p.cfg.snooze * 6e4, k } } : e) }));
    show('Soneca ativada. Na hora de sair não tem soneca!');
  }
  function confirm(id, k) {
    if (k !== 'leave') return;
    update(p => {
      const e = p.events.find(x => x.id === id);
      if (!e || e.leftOk) return p;
      return award({ ...p, events: p.events.map(x => x.id === id ? { ...x, leftOk: true } : x) }, XP.left, 'Saiu na hora! Agora é só chegar.');
    });
  }

  if (!S) return <View style={{ flex: 1, backgroundColor: dark ? '#1c0f18' : '#fff5f9' }} />;

  const look = ERAS.find(e => e[1] === S.look) || ERAS[6];
  const c = palette(dark, look[2], look[3]);
  const st = styles(c);
  const L = lvl(S.xp);
  const now = Date.now();
  const pool = QUOTES.concat(S.myQuotes);
  const buffer = smartBuffer(S.cfg, S.lateLog);

  const setCfg = (k, v) => update(p => ({ ...p, cfg: { ...p.cfg, [k]: k === 'smart' ? v : clampCfg(k, v, p.cfg[k]) }, ...(k === 'focus' ? { focusLeft: null } : {}) }));

  const toggleTask = id => update(p => {
    const tasks = p.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t);
    const done = tasks.find(t => t.id === id).done;
    let n = { ...p, tasks, stats: { ...p.stats, tasksDone: p.stats.tasksDone + (done ? 1 : -1) } };
    if (!done) return { ...n, xp: Math.max(0, p.xp - XP.task) };
    let msg = 'Faixa cumprida!';
    if (!p.dayFull && tasks.every(t => t.done)) { n = { ...n, dayFull: true, stats: { ...n.stats, fullDays: n.stats.fullDays + 1 } }; msg = 'Setlist completa! Bis!'; }
    return award(n, XP.task, msg);
  });

  const markEvent = (id, late) => update(p => {
    const n = { ...p, events: p.events.map(e => e.id === id ? { ...e, status: late ? 'late' : 'ontime' } : e), lateLog: [...p.lateLog, late] };
    if (!late) return award({ ...n, stats: { ...n.stats, onTime: n.stats.onTime + 1 } }, XP.onTime, 'Pontualidade de headliner!');
    const a = award({ ...n, stats: { ...n.stats, late: n.stats.late + 1 } }, XP.late, 'Anotado.');
    show(`Anotado. A folga agora é ${smartBuffer(a.cfg, a.lateLog)} min.`);
    return a;
  });

  const pickPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.4, base64: true });
    if (!r.canceled && r.assets[0]?.base64) { update(p => ({ ...p, photo: 'data:image/jpeg;base64,' + r.assets[0].base64 })); show('A estrela entrou no palco!'); }
  };

  const focusRunning = !!S.focusEnd;
  const focusLeft = focusRunning ? Math.max(0, S.focusEnd - now) : (S.focusLeft ?? S.cfg.focus * 6e4);
  const secs = Math.ceil(focusLeft / 1000);
  const toggleFocus = () => update(p => p.focusEnd
    ? { ...p, focusLeft: p.focusEnd - Date.now(), focusEnd: null }
    : { ...p, focusEnd: Date.now() + (p.focusLeft ?? p.cfg.focus * 6e4) });

  const events = S.events.filter(e => !e.status || now - new Date(e.time) < 864e5).sort((a, b) => new Date(a.time) - new Date(b.time));
  const doneCount = S.tasks.filter(t => t.done).length;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={st.page} keyboardShouldPersistTaps="handled">
          {/* palco */}
          <LinearGradient colors={[c.accent, c.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.stage}>
            <View style={st.row}>
              <Pressable onPress={pickPhoto} style={st.avatar} accessibilityLabel="Escolher sua foto de estrela">
                {S.photo ? <Image source={{ uri: S.photo }} style={st.avatarImg} /> : <Text style={st.avatarTxt}>Sua foto</Text>}
              </Pressable>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={st.eyebrow}>Era {L.i + 1} de 12{L.next ? ` · faltam ${L.next[0] - S.xp} XP` : ' · turnê completa'}</Text>
                <Text style={st.h1}>{L.cur[1]}</Text>
                <TextInput value={S.artist} onChangeText={v => update(p => ({ ...p, artist: v }))} placeholder="Seu nome artístico" placeholderTextColor="rgba(255,255,255,.7)" style={st.artist} maxLength={30} />
              </View>
            </View>
            <View style={st.bar}><View style={[st.barFill, { width: `${L.next ? (S.xp - L.cur[0]) / (L.next[0] - L.cur[0]) * 100 : 100}%` }]} /></View>
            <View style={[st.row, { gap: 22 }]}>
              <Stat n={S.xp} l="XP" st={st} /><Stat n={S.stats.streak} l="dias de turnê" st={st} /><Stat n={S.stats.onTime} l="shows no horário" st={st} />
            </View>
            <Text style={st.eyebrow}>Looks das eras desbloqueadas</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {unlockedLooks(S.xp).map(e => (
                <Pressable key={e[1]} onPress={() => update(p => ({ ...p, look: e[1] }))} style={[st.look, S.look === e[1] && st.lookOn]}>
                  <Text style={[st.lookTxt, S.look === e[1] && { color: c.accent2 }]}>{e[1]}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </LinearGradient>

          <Text style={st.quote}>“{pool[new Date().getDate() % pool.length]}”</Text>

          {/* ingressos */}
          <Section title="Ingressos" hint="hora de sair" st={st}>
            {events.length === 0 && <Text style={st.empty}>Nenhum ingresso. Adicione um compromisso e o app calcula a hora de sair e agenda os alarmes.</Text>}
            {events.map(e => {
              const tt = times(e, S.cfg, S.lateLog);
              let color = c.accent, count;
              if (e.status) { color = e.status === 'ontime' ? c.ok : c.muted; count = e.status === 'ontime' ? 'Show no horário ✦' : 'Atrasou. O próximo show é seu.'; }
              else if (now < tt.ready) count = `Camarim abre em ${dur(tt.ready - now)}`;
              else if (now < tt.leave) { color = c.warn; count = `Camarim aberto! Sair em ${dur(tt.leave - now)}`; }
              else if (now < tt.at) { color = c.bad; count = `Hora de sair! O show começa em ${dur(tt.at - now)}`; }
              else { color = c.muted; count = 'As cortinas já abriram. Como foi?'; }
              return (
                <View key={e.id} style={[st.ticket, { borderLeftColor: color }]}>
                  <View style={{ flex: 1, gap: 6, padding: 14 }}>
                    <Text style={st.label}>Admite 1 · {tt.at.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}</Text>
                    <Text style={st.h3}>{e.title}</Text>
                    <Text style={[st.count, { color }]}>{count}</Text>
                    <View style={[st.row, { gap: 6 }]}>
                      {[['Camarim', tt.ready], ['Saída', tt.leave], ['Show', tt.at]].map(([l, d]) => (
                        <View key={l} style={st.gate}><Text style={st.gateL}>{l}</Text><Text style={st.gateV}>{hm(d)}</Text></View>
                      ))}
                    </View>
                    {!e.status && now >= tt.leave && (
                      <View style={{ gap: 8 }}>
                        <Btn st={st} kind="ok" title="Cheguei a tempo" onPress={() => markEvent(e.id, 0)} />
                        <View style={[st.row, { gap: 6, flexWrap: 'wrap' }]}>
                          <Text style={st.note}>Me atrasei:</Text>
                          {[5, 15, 30].map(m => <Btn key={m} st={st} kind="ghost" title={m === 30 ? '30+ min' : `${m} min`} onPress={() => markEvent(e.id, m)} />)}
                        </View>
                      </View>
                    )}
                    <View style={[st.row, { gap: 16 }]}>
                      {!e.status && <Pressable onPress={() => setEditing(e)}><Text style={st.link}>Editar</Text></Pressable>}
                      <Pressable onPress={() => update(p => ({ ...p, events: p.events.filter(x => x.id !== e.id) }))}><Text style={st.linkMuted}>Cancelar ingresso</Text></Pressable>
                    </View>
                  </View>
                  <View style={st.stub}><Text style={st.gateL}>Saída</Text><Text style={st.stubV}>{hm(tt.leave)}</Text></View>
                </View>
              );
            })}
            <Btn st={st} title="Emitir ingresso" onPress={() => { const d = new Date(); d.setHours(d.getHours() + 2, 0, 0, 0); setEditing({ id: null, title: '', time: d.toISOString(), prep: 40, travel: 20 }); }} />
          </Section>

          {/* plano anti-atraso */}
          <Section title="Plano anti-atraso" hint="ajustes" st={st}>
            <View style={[st.card, st.row, { justifyContent: 'space-between' }]}>
              <View style={{ flex: 1 }}>
                <Text style={st.h3}>Folga inteligente</Text>
                <Text style={st.note}>{S.cfg.smart ? `Base de ${S.cfg.base} min. Cresce quando você se atrasa (até ${S.cfg.max} min) e volta a diminuir quando chega no horário.` : `Fixa em ${S.cfg.base} min.`}</Text>
              </View>
              <Text style={st.big}>{buffer} min</Text>
            </View>
            <View style={[st.row, { justifyContent: 'space-between' }]}>
              <Text style={st.body}>Ajustar a folga sozinha</Text>
              <Switch value={S.cfg.smart} onValueChange={v => setCfg('smart', v)} trackColor={{ true: c.accent }} />
            </View>
            <View style={st.grid}>
              <Num st={st} label="Folga base (min)" value={S.cfg.base} onSet={v => setCfg('base', v)} />
              <Num st={st} label="Folga máxima (min)" value={S.cfg.max} onSet={v => setCfg('max', v)} />
              <Num st={st} label="Aviso antes de sair" value={S.cfg.warn} onSet={v => setCfg('warn', v)} />
              <Num st={st} label="Soneca (min)" value={S.cfg.snooze} onSet={v => setCfg('snooze', v)} />
            </View>
            <Text style={st.note}>Cada ingresso tem 3 alarmes: camarim, {S.cfg.warn} min antes de sair e hora de sair. Eles chegam como notificação mesmo com o app fechado. Compromissos antes das 13h também ganham um aviso às 20h da véspera.</Text>
            <Text style={st.h3}>Bolsa de saída</Text>
            <Chips st={st} items={S.bag} onRemove={i => update(p => ({ ...p, bag: p.bag.filter((_, k) => k !== i) }))} />
            <AddRow st={st} placeholder="Ex.: Carregador" button="Pôr na bolsa" onAdd={v => update(p => ({ ...p, bag: [...p.bag, v] }))} />
          </Section>

          {/* setlist */}
          <Section title="Setlist de hoje" hint={S.tasks.length ? `${doneCount} de ${S.tasks.length} faixas` : ''} st={st}>
            {S.tasks.length === 0 && <Text style={st.empty}>Setlist vazia. Qual é a primeira faixa do show de hoje?</Text>}
            {S.tasks.map((t, i) => (
              <View key={t.id} style={[st.card, st.row]}>
                <Text style={st.num}>{i + 1}</Text>
                <Pressable onPress={() => toggleTask(t.id)} style={[st.chk, t.done && { backgroundColor: c.accent }]} accessibilityLabel={(t.done ? 'Desmarcar ' : 'Concluir ') + t.t}>
                  {t.done && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={[st.body, t.done && { textDecorationLine: 'line-through', opacity: 0.55 }]}>{t.t}</Text>
                  <Text style={st.note}>{t.cat} · {t.daily ? 'todo dia' : 'só hoje'}</Text>
                </View>
                <Pressable onPress={() => update(p => ({ ...p, tasks: p.tasks.filter(x => x.id !== t.id) }))} hitSlop={10}><Text style={st.x}>×</Text></Pressable>
              </View>
            ))}
            <NewTask st={st} c={c} onAdd={t => update(p => ({ ...p, tasks: [...p.tasks, { id: uid(), done: false, ...t }] }))} />
          </Section>

          {/* estúdio */}
          <Section title="Estúdio" hint={`sessão de ${S.cfg.focus} min`} st={st}>
            <View style={st.studio}>
              <View style={[st.row, { gap: 18 }]}>
                <View style={[st.vinyl, { borderColor: c.accent }]}><View style={[st.vinylDot, { backgroundColor: c.accent }]} /></View>
                <View style={{ gap: 6 }}>
                  <Text style={[st.onair, focusRunning && st.onairLive]}>● ON AIR</Text>
                  <Text style={st.clock}>{String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}</Text>
                </View>
              </View>
              <View style={[st.row, { gap: 8 }]}>
                <Btn st={st} title={focusRunning ? 'Pausar' : (S.focusLeft ? 'Continuar' : 'Começar gravação')} onPress={toggleFocus} />
                <Btn st={st} kind="ghost" title="Zerar" onPress={() => update(p => ({ ...p, focusEnd: null, focusLeft: null }))} />
              </View>
              {focusRunning
                ? <Text style={st.studioNote}>Pause ou zere a sessão para mudar a duração.</Text>
                : <Num st={st} dark label="Duração da sessão (min)" value={S.cfg.focus} onSet={v => setCfg('focus', v)} />}
              <Text style={st.studioNote}>Cada sessão gravada vale {focusXP(S.cfg.focus)} XP. Você recebe uma notificação no fim, mesmo com o app fechado.</Text>
            </View>
          </Section>

          {/* discos */}
          <Section title="Coleção de discos" hint={`${Object.keys(S.unlocked).length} de ${ACH.length}`} st={st}>
            <View style={st.discs}>
              {ACH.map(([id, name, desc, tier]) => {
                const on = !!S.unlocked[id];
                const col = { ouro: ['#f5d27a', '#b9842a'], platina: ['#f2f2f6', '#a7a9b6'], diamante: ['#e9fbff', '#9fd9f2'] }[tier];
                return (
                  <View key={id} style={st.disc}>
                    <LinearGradient colors={on ? col : [c.soft, c.line]} style={[st.discImg, !on && { opacity: 0.5 }]}>
                      <View style={[st.discHole, { backgroundColor: on ? c.accent : c.bg }]} />
                    </LinearGradient>
                    <Text style={st.tier}>{tier}</Text>
                    <Text style={[st.discName, !on && { opacity: 0.55 }]}>{name}</Text>
                    <Text style={st.discDesc}>{desc}</Text>
                  </View>
                );
              })}
            </View>
          </Section>

          {/* frases */}
          <Section title="Suas frases" hint="tocam nos alarmes" st={st}>
            {S.myQuotes.length === 0 && <Text style={st.empty}>Nenhuma frase ainda. As que você salvar entram nos alarmes e na frase do dia.</Text>}
            <Chips st={st} items={S.myQuotes} onRemove={i => update(p => ({ ...p, myQuotes: p.myQuotes.filter((_, k) => k !== i) }))} />
            <AddRow st={st} placeholder="Sua frase favorita" button="Salvar frase" max={140} onAdd={v => { update(p => ({ ...p, myQuotes: [...p.myQuotes, v] })); show('Frase salva no camarim!'); }} />
          </Section>
          <Text style={[st.note, { textAlign: 'center' }]}>Tudo fica salvo neste iPhone. Os itens com "(exemplo)" podem ser apagados.</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <TicketForm st={st} c={c} ticket={editing} onClose={() => setEditing(null)}
        onSave={t => { update(p => ({ ...p, events: t.id ? p.events.map(e => e.id === t.id ? { ...e, ...t, fired: undefined, snooze: null } : e) : [...p.events, { ...t, id: uid(), status: null }] })); setEditing(null); show(t.id ? 'Ingresso atualizado. Alarmes reagendados.' : 'Ingresso emitido. Alarmes agendados!'); }} />

      <AlarmScreen st={st} c={c} alarm={alarm} S={S} onClose={() => setAlarm(null)}
        onOk={() => { confirm(alarm.id, alarm.k); setAlarm(null); }}
        onSnooze={() => { snooze(alarm.id, alarm.k); setAlarm(null); }} />

      {toast && <View style={st.toast} pointerEvents="none"><Text style={st.toastTxt}>{toast}</Text></View>}
    </View>
  );
}

/* ---------- peças ---------- */
const Stat = ({ n, l, st }) => <View><Text style={st.statN}>{n}</Text><Text style={st.statL}>{l}</Text></View>;
const Section = ({ title, hint, children, st }) => (
  <View style={{ gap: 10 }}>
    <View style={[st.row, { justifyContent: 'space-between', alignItems: 'baseline' }]}><Text style={st.h2}>{title}</Text>{!!hint && <Text style={st.hint}>{hint}</Text>}</View>
    {children}
  </View>
);
const Btn = ({ title, onPress, kind, st }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [st.btn, kind === 'ghost' && st.btnGhost, kind === 'ok' && st.btnOk, pressed && { opacity: 0.8 }]}>
    <Text style={[st.btnTxt, kind === 'ghost' && st.btnGhostTxt]}>{title}</Text>
  </Pressable>
);
function Num({ label, value, onSet, st, dark }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <View style={{ flexGrow: 1, flexBasis: '45%', gap: 4 }}>
      <Text style={dark ? st.studioNote : st.note}>{label}</Text>
      <TextInput value={v} onChangeText={setV} onEndEditing={() => onSet(v)} keyboardType="number-pad" returnKeyType="done" style={st.input} />
    </View>
  );
}
const Chips = ({ items, onRemove, st }) => (
  <View style={[st.row, { flexWrap: 'wrap', gap: 6 }]}>
    {items.map((t, i) => (
      <View key={t + i} style={st.chip}><Text style={[st.body, { flexShrink: 1 }]}>{t}</Text>
        <Pressable onPress={() => onRemove(i)} hitSlop={8} accessibilityLabel={'Remover ' + t}><Text style={st.x}>×</Text></Pressable></View>
    ))}
  </View>
);
function AddRow({ placeholder, button, onAdd, st, max }) {
  const [v, setV] = useState('');
  const go = () => { if (v.trim()) { onAdd(v.trim()); setV(''); } };
  return (
    <View style={[st.row, { gap: 8 }]}>
      <TextInput value={v} onChangeText={setV} placeholder={placeholder} placeholderTextColor={st.ph.color} style={[st.input, { flex: 1 }]} maxLength={max} onSubmitEditing={go} returnKeyType="done" />
      <Btn st={st} kind="ghost" title={button} onPress={go} />
    </View>
  );
}
function NewTask({ onAdd, st, c }) {
  const [t, setT] = useState(''); const [cat, setCat] = useState('Estudo'); const [daily, setDaily] = useState(false);
  const go = () => { if (t.trim()) { onAdd({ t: t.trim(), cat, daily }); setT(''); setDaily(false); } };
  return (
    <View style={[st.card, { gap: 10 }]}>
      <TextInput value={t} onChangeText={setT} placeholder="Nova faixa da setlist" placeholderTextColor={st.ph.color} style={st.input} onSubmitEditing={go} returnKeyType="done" />
      <View style={[st.row, { gap: 6, flexWrap: 'wrap' }]}>
        {['Estudo', 'Trabalho', 'Organização'].map(x => (
          <Pressable key={x} onPress={() => setCat(x)} style={[st.tag, cat === x && { backgroundColor: c.accent }]}><Text style={[st.tagTxt, cat === x && { color: '#fff' }]}>{x}</Text></Pressable>
        ))}
      </View>
      <View style={[st.row, { justifyContent: 'space-between' }]}>
        <View style={[st.row, { gap: 8 }]}><Switch value={daily} onValueChange={setDaily} trackColor={{ true: c.accent }} /><Text style={st.body}>Todo dia</Text></View>
        <Btn st={st} title="Adicionar" onPress={go} />
      </View>
    </View>
  );
}
function TicketForm({ ticket, onClose, onSave, st, c }) {
  const [f, setF] = useState(null);
  useEffect(() => setF(ticket && { ...ticket, prep: String(ticket.prep), travel: String(ticket.travel) }), [ticket]);
  if (!f) return null;
  // o Android não tem seletor de data e hora juntos: abre um diálogo para cada
  const pickAndroid = mode => DateTimePickerAndroid.open({
    value: new Date(f.time), mode, is24Hour: true,
    onChange: (ev, d) => {
      if (ev.type !== 'set' || !d) return;
      setF(p => {
        const t = new Date(p.time);
        if (mode === 'date') t.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
        else t.setHours(d.getHours(), d.getMinutes(), 0, 0);
        return { ...p, time: t.toISOString() };
      });
    },
  });
  const save = () => {
    if (!f.title.trim()) return Alert.alert('Dê um nome ao compromisso', 'Ex.: Aula de cálculo.');
    onSave({ id: f.id, title: f.title.trim(), time: f.time, prep: Math.max(0, parseInt(f.prep) || 0), travel: Math.max(0, parseInt(f.travel) || 0) });
  };
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior="padding">
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={[st.page, { gap: 14 }]} keyboardShouldPersistTaps="handled">
        <Text style={st.h2}>{f.id ? 'Editar ingresso' : 'Novo ingresso'}</Text>
        <TextInput value={f.title} onChangeText={v => setF({ ...f, title: v })} placeholder="Ex.: Aula de cálculo" placeholderTextColor={st.ph.color} style={st.input} autoFocus={!f.id} />
        {Platform.OS === 'ios'
          ? <DateTimePicker value={new Date(f.time)} mode="datetime" display="inline" locale="pt-BR" minuteInterval={5} accentColor={c.accent}
              onChange={(_, d) => d && setF({ ...f, time: d.toISOString() })} />
          : <View style={{ gap: 4 }}>
              <Text style={st.note}>Data e hora do compromisso</Text>
              <View style={[st.row, { gap: 8 }]}>
                <Btn st={st} kind="ghost" title={new Date(f.time).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} onPress={() => pickAndroid('date')} />
                <Btn st={st} kind="ghost" title={hm(new Date(f.time))} onPress={() => pickAndroid('time')} />
              </View>
            </View>}
        <View style={[st.row, { gap: 10 }]}>
          <View style={{ flex: 1, gap: 4 }}><Text style={st.note}>Camarim (se arrumar, min)</Text><TextInput value={f.prep} onChangeText={v => setF({ ...f, prep: v })} keyboardType="number-pad" style={st.input} /></View>
          <View style={{ flex: 1, gap: 4 }}><Text style={st.note}>Trajeto (min)</Text><TextInput value={f.travel} onChangeText={v => setF({ ...f, travel: v })} keyboardType="number-pad" style={st.input} /></View>
        </View>
        <Btn st={st} title={f.id ? 'Salvar alterações' : 'Emitir ingresso'} onPress={save} />
        <Btn st={st} kind="ghost" title="Voltar" onPress={onClose} />
      </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
function AlarmScreen({ alarm, S, onOk, onSnooze, onClose, st, c }) {
  const [checked, setChecked] = useState({});
  const [quote, setQuote] = useState('');
  useEffect(() => { if (alarm) { setChecked({}); setQuote(pick(PHRASES[alarm.k].concat(S.myQuotes))); } }, [alarm]);
  const ev = alarm && S.events.find(e => e.id === alarm.id);
  if (!ev) return null;
  const k = alarm.k, tt = times(ev, S.cfg, S.lateLog);
  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <LinearGradient colors={[c.accent, c.accent2]} style={st.alarm}>
        <ScrollView contentContainerStyle={st.alarmBox}>
          <Text style={st.eyebrow}>{k === 'warn' ? `Faltam ${S.cfg.warn} minutos` : STAGE[k][0]}</Text>
          <Text style={st.alarmTime}>{hm(k === 'ready' ? tt.ready : tt.leave)}</Text>
          <Text style={[st.h1, { textAlign: 'center' }]}>{STAGE[k][1]} {ev.title}</Text>
          <Text style={st.alarmQuote}>“{quote}”</Text>
          {k !== 'ready' && S.bag.map((b, i) => (
            <Pressable key={b + i} onPress={() => setChecked({ ...checked, [i]: !checked[i] })} style={st.bagItem}>
              <View style={[st.bagBox, checked[i] && { backgroundColor: '#fff' }]}>{checked[i] && <Text style={{ color: c.accent2, fontWeight: '800' }}>✓</Text>}</View>
              <Text style={st.bagTxt}>{b}</Text>
            </Pressable>
          ))}
          <Pressable onPress={onOk} style={st.alarmBtn}><Text style={[st.btnTxt, { color: c.accent2, fontSize: 17 }]}>{STAGE[k][2]}</Text></Pressable>
          {k !== 'leave' && <Pressable onPress={onSnooze} style={[st.alarmBtn, { backgroundColor: 'rgba(255,255,255,.2)' }]}><Text style={[st.btnTxt, { fontSize: 16 }]}>Soneca de {S.cfg.snooze} min</Text></Pressable>}
        </ScrollView>
      </LinearGradient>
    </Modal>
  );
}

/* ---------- visual ---------- */
function palette(dark, accent, accent2) {
  return dark
    ? { bg: '#1c0f18', surface: '#2a1724', ink: '#ffe8f3', muted: '#c99ab5', soft: '#4a2140', line: '#4b2742', gold: '#e8b75a', ok: '#4fd19b', warn: '#f0a35a', bad: '#ff7482', accent, accent2 }
    : { bg: '#fff5f9', surface: '#ffffff', ink: '#3b1430', muted: '#8a5a78', soft: '#ffd6e8', line: '#f6c9dd', gold: '#c9932e', ok: '#1f9d6b', warn: '#d9822b', bad: '#d23b4b', accent, accent2 };
}
const display = Platform.select({ ios: 'AvenirNext-Heavy', android: 'sans-serif-black' });
const hand = Platform.select({ ios: 'SnellRoundhand-Bold', android: 'cursive' });
const styles = c => StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 60, paddingBottom: 60, gap: 26 },
  row: { flexDirection: 'row', alignItems: 'center' },
  stage: { borderRadius: 24, padding: 20, gap: 14 },
  avatar: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: '#fff', backgroundColor: 'rgba(255,255,255,.2)', alignItems: 'center', justifyContent: 'center', marginRight: 14, overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  eyebrow: { color: '#fff', opacity: 0.9, fontSize: 11, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase' },
  h1: { color: '#fff', fontFamily: display, fontSize: 28, fontWeight: '800', lineHeight: 32 },
  artist: { color: '#fff', fontFamily: hand, fontSize: 22, padding: 0 },
  bar: { height: 10, borderRadius: 99, backgroundColor: 'rgba(255,255,255,.28)', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#fff', borderRadius: 99 },
  statN: { color: '#fff', fontFamily: display, fontSize: 20, fontVariant: ['tabular-nums'] },
  statL: { color: '#fff', fontSize: 12 },
  look: { borderWidth: 2, borderColor: 'rgba(255,255,255,.5)', backgroundColor: 'rgba(255,255,255,.12)', borderRadius: 99, paddingVertical: 5, paddingHorizontal: 12 },
  lookOn: { backgroundColor: '#fff', borderColor: '#fff' },
  lookTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  quote: { fontFamily: hand, fontSize: 22, color: c.accent, textAlign: 'center', paddingHorizontal: 8 },
  h2: { fontFamily: display, fontSize: 20, color: c.ink },
  h3: { fontFamily: display, fontSize: 16, color: c.ink },
  hint: { fontSize: 11, color: c.muted, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '600' },
  body: { fontSize: 15, color: c.ink },
  note: { fontSize: 13, color: c.muted, lineHeight: 18 },
  empty: { fontSize: 14, color: c.muted },
  big: { fontFamily: display, fontSize: 22, color: c.accent, marginLeft: 10, fontVariant: ['tabular-nums'] },
  card: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 12, gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  input: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: c.ink },
  ph: { color: c.muted },
  btn: { backgroundColor: c.accent, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center' },
  btnGhost: { backgroundColor: c.soft },
  btnOk: { backgroundColor: c.ok },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnGhostTxt: { color: c.ink },
  ticket: { flexDirection: 'row', backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderLeftWidth: 6, borderRadius: 16, overflow: 'hidden' },
  label: { fontSize: 10, color: c.muted, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: '700' },
  count: { fontFamily: display, fontSize: 16 },
  gate: { flex: 1, backgroundColor: c.soft, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 6 },
  gateL: { fontSize: 9, color: c.muted, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '700' },
  gateV: { fontSize: 14, fontWeight: '700', color: c.ink, fontVariant: ['tabular-nums'] },
  stub: { borderLeftWidth: 2, borderStyle: 'dashed', borderLeftColor: c.line, padding: 12, alignItems: 'center', justifyContent: 'center', minWidth: 82 },
  stubV: { fontFamily: display, fontSize: 20, color: c.ink, fontVariant: ['tabular-nums'] },
  link: { color: c.accent, fontWeight: '700' },
  linkMuted: { color: c.muted },
  num: { fontFamily: display, color: c.accent, width: 20, textAlign: 'right', fontVariant: ['tabular-nums'] },
  chk: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  x: { color: c.muted, fontSize: 20, paddingHorizontal: 4 },
  tag: { backgroundColor: c.soft, borderRadius: 99, paddingVertical: 5, paddingHorizontal: 12 },
  tagTxt: { color: c.accent, fontWeight: '700', fontSize: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 99, paddingLeft: 12, paddingRight: 6, paddingVertical: 4, maxWidth: '100%' },
  studio: { backgroundColor: '#2b1a26', borderRadius: 20, padding: 18, gap: 14 },
  vinyl: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#1a1a1a', borderWidth: 8, alignItems: 'center', justifyContent: 'center' },
  vinylDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: '#fff' },
  onair: { color: '#ff5c7a', fontSize: 11, fontWeight: '700', letterSpacing: 2, opacity: 0.35 },
  onairLive: { opacity: 1 },
  clock: { color: '#fff', fontFamily: display, fontSize: 44, fontVariant: ['tabular-nums'] },
  studioNote: { color: '#d9b8cb', fontSize: 13, lineHeight: 18 },
  discs: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 18 },
  disc: { width: '48%', alignItems: 'center', gap: 4 },
  discImg: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  discHole: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#fff' },
  tier: { fontSize: 9, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', color: c.gold },
  discName: { fontFamily: display, fontSize: 14, color: c.ink, textAlign: 'center' },
  discDesc: { fontSize: 12, color: c.muted, textAlign: 'center' },
  alarm: { flex: 1 },
  alarmBox: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 70, gap: 16, alignItems: 'stretch' },
  alarmTime: { color: '#fff', fontFamily: display, fontSize: 64, textAlign: 'center', fontVariant: ['tabular-nums'] },
  alarmQuote: { color: '#fff', fontFamily: hand, fontSize: 24, textAlign: 'center' },
  alarmBtn: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  bagItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,.16)', borderRadius: 12, padding: 12 },
  bagBox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  bagTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  toast: { position: 'absolute', left: 16, right: 16, bottom: 64, backgroundColor: c.ink, borderRadius: 14, padding: 14 },
  toastTxt: { color: c.bg, fontWeight: '700', textAlign: 'center' },
});
