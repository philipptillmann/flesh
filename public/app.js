import {normalizeJournal, observationFeed} from './observations.js';
import {authSecret, randomSalt, vaultKey, encrypt, decrypt} from './crypto.js';
const root = document.querySelector('#app');
let key, data, revision, page='today', busy=false, lastActivity=Date.now(), timer, authMode='login', generation=0, observationKind='general', observationFilter='all';
const localDate = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => new Date(value.length===10?value+'T12:00:00':value).toLocaleDateString('de-DE',{day:'numeric',month:'short',year:'numeric'});
const labelDate = () => `<label>Datum<input name="date" type="date" value="${localDate()}" required></label>`;
const note = () => '<label>Notizen<textarea name="note" maxlength="2000" placeholder="Optionale Angaben"></textarea></label>';
const empty = text => `<p class="empty">${text}</p>`;
function toast(message) { const el=document.querySelector('#status'); el.textContent=message; clearTimeout(timer); timer=setTimeout(()=>el.textContent='',6500); }
async function api(path, body) {
  const res=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const value=await res.json();
  if(!res.ok) throw new Error(value.error || 'Anfrage fehlgeschlagen.');
  return value;
}
function authScreen() {
  root.innerHTML=`<main class="auth"><div class="brand"><img class="logo" src="/icon-192.png" alt="" width="42" height="42"> Flesh</div><div class="auth-grid"><section><h1>Gesundheitsjournal</h1><p class="intro">Körperliche Beobachtungen, Menstruation und Medikamente erfassen.</p><p class="hint">Daten werden im Browser verschlüsselt und auf dem Server gespeichert.</p></section><section class="card login"><h2>${authMode==='login'?'Anmelden':'Account erstellen'}</h2><form id="auth"><label>Benutzername<input name="username" required minlength="3" maxlength="64" pattern="[a-zA-Z0-9_.-]+" autocomplete="username" autocapitalize="none"></label><label>Passwort<input name="password" type="password" minlength="12" maxlength="256" required autocomplete="${authMode==='login'?'current-password':'new-password'}"></label>${authMode==='register'?'<label>Passwort wiederholen<input name="confirm" type="password" required autocomplete="new-password"></label><p class="hint">Mindestens 12 Zeichen. Ohne Passwort sind die Daten nicht wiederherstellbar.</p>':''}<button class="primary" type="submit">${authMode==='login'?'Journal entsperren':'Account erstellen'}</button><p id="auth-error" role="alert"></p></form><button class="link" id="auth-toggle">${authMode==='login'?'Account erstellen':'Zur Anmeldung'}</button></section></div></main>`;
  document.querySelector('#auth-toggle').onclick=()=>{authMode=authMode==='login'?'register':'login';authScreen();};
  document.querySelector('#auth').onsubmit=async e=>{
    e.preventDefault(); if(busy)return;
    const f=new FormData(e.target), username=f.get('username').trim().toLowerCase(), password=f.get('password');
    const error=document.querySelector('#auth-error'), button=e.target.querySelector('button');
    if(!crypto.subtle){error.textContent='Für Verschlüsselung ist HTTPS erforderlich (oder localhost).';return;}
    if(authMode==='register' && password!==f.get('confirm')){error.textContent='Die Passwörter stimmen nicht überein.';return;}
    busy=true;button.disabled=true;button.textContent='Wird sicher entsperrt …';
    try {
      const auth=await authSecret(username,password);
      let result;
      if(authMode==='register') {
        const keySalt=randomSalt(); key=await vaultKey(password,keySalt);
        const initial={version:1,conditions:[],pain:[],meds:[],intakes:[],cycles:[],observations:[]};
        result=await api('register',{username,auth,keySalt,vault:await encrypt(key,initial)});
      } else { result=await api('login',{username,auth});key=await vaultKey(password,result.keySalt); }
      data=normalizeJournal(await decrypt(key,result.vault)); revision=result.revision;lastActivity=Date.now();e.target.reset();page='today';observationKind='general';observationFilter='all';render();
    } catch(err) {key=null;data=null;error.textContent=err.message;button.disabled=false;button.textContent='Erneut versuchen';}
    finally{busy=false;}
  };
}
const names={today:'Übersicht',observations:'Beobachtungen',meds:'Medikamente',settings:'Datenschutz'};
function render() {
  if(!data)return;
  root.innerHTML=`<div class="layout"><aside><a class="brand" href="#"><img class="logo" src="/icon-192.png" alt="" width="42" height="42"><span>Flesh<small>GESUNDHEITSJOURNAL</small></span></a><nav>${Object.entries(names).map(([id,name],i)=>`<button data-page="${id}" class="${page===id?'active':''}"><span aria-hidden="true">${['◫','◌','✚','◇'][i]}</span>${name}</button>`).join('')}</nav><div class="sidebar-bottom"><p>◇ Ende-zu-Ende verschlüsselt</p><button data-action="lock">Journal sperren ↗</button></div></aside><main class="main"><header><span>${new Date().toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'})}</span><button class="lock-mobile" data-action="lock">Sperren ◇</button><span class="secure">◇ Verschlüsselt</span></header><div id="content">${content()}</div></main></div>`;
  root.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{page=b.dataset.page;render();});
  root.querySelectorAll('[data-action="lock"]').forEach(b=>b.onclick=lock);
  bindForms();
  root.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Diesen Eintrag endgültig löschen?'))return;await mutate(d=>{d[b.dataset.collection]=d[b.dataset.collection].filter(x=>x.id!==b.dataset.delete);});});
  root.querySelectorAll('[data-intake]').forEach(b=>b.onclick=()=>mutate(d=>d.intakes.push({id:crypto.randomUUID(),medId:b.dataset.intake,date:localDate(),time:b.dataset.time,takenAt:new Date().toISOString(),medName:d.meds.find(m=>m.id===b.dataset.intake)?.name,dose:d.meds.find(m=>m.id===b.dataset.intake)?.dose})));
  document.querySelector('#notifications')?.addEventListener('click',async()=>{if(!('Notification'in window)){toast('Dieser Browser unterstützt hier keine Benachrichtigungen.');return;}try{toast((await Notification.requestPermission())==='granted'?'Erinnerungen sind bei geöffneter, entsperrter App aktiviert.':'Benachrichtigungen wurden nicht erlaubt.');}catch{toast('Benachrichtigungen sind auf diesem Gerät nicht verfügbar.');}});
  document.querySelector('#export')?.addEventListener('click',async()=>{try{const v=await api('vault');const blob=new Blob([JSON.stringify({format:'health-app-encrypted-v1',keySalt:v.keySalt,vault:v.vault},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='journal-verschluesselt-'+localDate()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(e){toast(e.message);}});
}
function title(heading, description = '') {
  return `<h1>${heading}</h1>${description ? `<p class="intro">${description}</p>` : ''}`;
}
function remove(collection, id) {
  return `<button class="delete" data-collection="${collection}" data-delete="${esc(id)}" aria-label="Eintrag löschen">Löschen</button>`;
}
function entriesList(entries) {
  if (!entries.length) return empty('Keine Beobachtungen vorhanden.');
  return entries.map(item => `<article class="entry" data-kind="${item.kind}"><div>
    <span class="tag">${item.label}</span><strong>${esc(item.title)}</strong>
    <p>${fmt(item.date)}${item.topic ? ' · '+esc(item.topic) : ''}</p>
    ${item.details.length ? `<p>${item.details.map(esc).join(' · ')}</p>` : ''}
    ${item.note ? `<p class="note">${esc(item.note)}</p>` : ''}
    </div>${remove(item.collection, item.id)}</article>`).join('');
}
function topicsField(name) {
  return `<label>Thema (optional)<select name="${name}"><option value="">Ohne Thema</option>${data.conditions.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>`;
}
function observationForm() {
  const typeSelect = `<label>Art der Beobachtung<select id="entry-kind"><option value="general" ${observationKind==='general'?'selected':''}>Allgemein</option><option value="pain" ${observationKind==='pain'?'selected':''}>Schmerz</option><option value="cycle" ${observationKind==='cycle'?'selected':''}>Menstruation</option></select></label>`;
  let fields;
  if (observationKind === 'general') {
    fields = `<label>Beobachtung<input name="title" maxlength="150" required placeholder="z. B. erholsamer Schlaf"></label>${topicsField('topicId')}
      <label>Einordnung<select name="tone"><option>Neutral</option><option>Positiv</option><option>Unangenehm</option></select></label>
      <div class="fields"><label>Messwert (optional)<input name="value" type="number" step="any"></label><label>Einheit (optional)<input name="unit" maxlength="32" placeholder="z. B. Stunden"></label></div>`;
  } else if (observationKind === 'pain') {
    fields = `${topicsField('conditionId')}<label>Schmerzstärke (0–10)<div class="range"><input name="level" type="range" min="0" max="10" value="5"><output>5 / 10</output></div></label>
      <label>Körperstelle<input name="location" maxlength="150"></label>`;
  } else {
    fields = `<label class="check-row"><input type="checkbox" name="periodStart">Erster Tag einer neuen Periode</label>
      <label for="cycle-flow">Blutung</label><select id="cycle-flow" name="flow"><option>Keine</option><option>Schmierblutung</option><option>Leicht</option><option>Mittel</option><option>Stark</option></select>
      <fieldset><legend>Beschwerden (optional)</legend><div class="checks">${['Krämpfe','Kopfschmerzen','Rückenschmerzen','Übelkeit','Müdigkeit','Brustspannen','Stimmungsschwankungen'].map(s=>`<label><input type="checkbox" name="symptoms" value="${s}">${s}</label>`).join('')}</div></fieldset>
      <label>Beschwerdestärke (0–10)<input name="level" type="number" min="0" max="10" value="0" required></label>`;
  }
  return `${typeSelect}<form id="observation-form">${labelDate()}${fields}${note()}<button class="primary">Beobachtung speichern</button></form>`;
}
function cycleSummary() {
  const starts = data.cycles.filter(c=>c.periodStart).map(c=>c.date).sort();
  if (!starts.length) return '<p class="hint">Kein Periodenbeginn erfasst.</p>';
  const days = (a,b) => Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000);
  const current = days(localDate(),starts.at(-1))+1;
  const lengths = starts.slice(1).map((s,i)=>days(s,starts[i]));
  return `<p class="hint">Letzter Periodenbeginn: ${fmt(starts.at(-1))}${current>0?' · Zyklustag '+current:''}${lengths.length?' · Zykluslängen: '+lengths.join(', ')+' Tage':''}.</p>`;
}
function doses() {return data.meds.flatMap(m=>m.times.split(',').map(t=>({med:m,time:t.trim()}))).filter(x=>(!x.med.start||x.med.start<=localDate())&&(!x.med.end||x.med.end>=localDate())).sort((a,b)=>a.time.localeCompare(b.time));}
function doseList(){const items=doses();return items.length?items.map(({med:m,time})=>{const taken=data.intakes.some(i=>i.medId===m.id&&i.date===localDate()&&i.time===time);return `<article class="entry"><span class="time">${esc(time)}</span><div><strong>${esc(m.name)}</strong><p>${esc(m.dose)}</p></div><button ${taken?'disabled class="taken"':'class="secondary"'} data-intake="${esc(m.id)}" data-time="${esc(time)}">${taken?'✓ Eingenommen':'Einnahme bestätigen'}</button></article>`;}).join(''):empty('Keine Einnahmen für heute geplant.');}

function content() {
  if (page === 'today') {
    const entries = observationFeed(data);
    return `${title('Übersicht')}<div class="stats">
      <div class="stat"><span>Beobachtungen heute</span><strong>${entries.filter(item=>item.date===localDate()).length}</strong><button data-page="observations">Beobachtung erfassen</button></div>
      <div class="stat peach"><span>Einnahmen heute</span><strong>${data.intakes.filter(i=>i.date===localDate()).length}<small> von ${doses().length} geplant</small></strong><button data-page="meds">Medikamentenplan</button></div>
      <div class="stat lilac"><span>Beobachtungen insgesamt</span><strong>${entries.length}</strong><button data-page="observations">Verlauf anzeigen</button></div>
      </div><section class="card"><h2>Geplante Einnahmen</h2>${doseList()}</section>
      <section class="card"><h2>Letzte Beobachtungen</h2>${entriesList(entries.slice(0,5))}</section>`;
  }
  if (page === 'observations') return `${title('Beobachtungen','Allgemeine Beobachtungen, Schmerzen und Menstruation.')}
    <div class="two-col"><section class="card"><h2>Beobachtung erfassen</h2>${observationForm()}</section>
    <section class="card"><h2>Themen</h2><p class="hint">Optionale Zuordnung, z. B. Schlaf, Bewegung, Haut oder Migräne.</p>
      <div class="chips">${data.conditions.map(c=>`<span class="chip">${esc(c.name)}</span>`).join('')}</div>
      <form id="condition-form"><label>Neues Thema<input name="name" maxlength="100" required></label><button class="secondary">Thema hinzufügen</button></form>
      ${(observationKind==='cycle'||observationFilter==='cycle')?`<section class="cycle-summary"><h2>Zyklusdaten</h2>${cycleSummary()}<p class="hint">Keine Fruchtbarkeitsvorhersage. Nicht zur Verhütung geeignet.</p></section>`:''}
    </section></div><section class="card"><div class="section-head"><h2>Verlauf</h2><label>Art filtern<select id="observation-filter">${[['all','Alle'],['general','Allgemein'],['pain','Schmerz'],['cycle','Menstruation']].map(([value,label])=>`<option value="${value}" ${observationFilter===value?'selected':''}>${label}</option>`).join('')}</select></label></div>
    ${entriesList(observationFeed(data,observationFilter))}</section>`;
  if (page === 'meds') return `${title('Medikamente','Pläne und Einnahmen.')}
    <section class="card"><h2>Geplante Einnahmen</h2>${doseList()}<button class="link" id="notifications">Benachrichtigungen erlauben</button><p class="hint">Erinnerungen nur bei laufender, entsperrter App. Für verlässliche Termine zusätzlich einen Systemwecker verwenden.</p></section>
    <div class="two-col"><section class="card"><h2>Medikament hinzufügen</h2><form id="med-form"><label>Name<input name="name" required maxlength="150"></label><label>Dosierung<input name="dose" required maxlength="150" placeholder="z. B. 1 Tablette · 20 mg"></label><label>Täglich um (mehrere Zeiten mit Komma)<input name="times" required placeholder="08:00, 20:00" value="08:00"></label><div class="fields"><label>Ab<input type="date" name="start" required value="${localDate()}"></label><label>Bis (optional)<input type="date" name="end"></label></div>${note()}<button class="primary">Plan speichern</button></form></section>
    <section class="card"><h2>Medikamentenpläne</h2>${data.meds.length?data.meds.map(m=>`<article class="entry"><div><strong>${esc(m.name)}</strong><p>${esc(m.dose)} · ${esc(m.times)}</p><p>Ab ${fmt(m.start)}${m.end?' bis '+fmt(m.end):''}</p><p class="note">${esc(m.note)}</p></div>${remove('meds',m.id)}</article>`).join(''):empty('Keine Medikamente vorhanden.')}</section></div>
    <section class="card"><h2>Einnahmeprotokoll</h2>${data.intakes.length?[...data.intakes].reverse().map(i=>`<article class="entry"><div><strong>${esc(i.medName||data.meds.find(m=>m.id===i.medId)?.name||'Entferntes Medikament')}</strong><p>${fmt(i.date)} · geplant ${esc(i.time)} · bestätigt ${new Date(i.takenAt).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</p></div>${remove('intakes',i.id)}</article>`).join(''):empty('Keine bestätigten Einnahmen.')}</section>`;
  return `${title('Datenschutz')}<section class="card prose"><h2>Verschlüsselung</h2><p>AES-256-GCM im Browser. Der Server speichert verschlüsselte Gesundheitsdaten und technische Kontodaten. Passwort und Datenschlüssel werden nicht übertragen.</p>
    <h2>Sperre und Speicherung</h2><p>Automatische Sperre nach fünf Minuten ohne Aktivität oder einer Minute im Hintergrund. Klartext liegt nur im Arbeitsspeicher des entsperrten Browsers. Speichern benötigt eine Serververbindung.</p>
    <h2>Zugriff</h2><p>Browser mit Account und Passwort können entschlüsseln. Keine Bindung an ein einzelnes Gerät. Ein manipulierter Server könnte veränderten Browsercode ausliefern.</p>
    <h2>Backup</h2><p>Download des zuletzt gespeicherten verschlüsselten Tresors. Ein Importdialog ist noch nicht verfügbar.</p><button class="secondary" id="export">Verschlüsseltes Backup herunterladen</button>
    <h2>Passwort</h2><p>Passwortwechsel und Wiederherstellungsschlüssel sind noch nicht verfügbar. Ohne Passwort bleiben die Daten unzugänglich.</p></section>`;
}
async function mutate(change) {
 if(busy||!data)return;
 busy=true;
 const next=structuredClone(data), currentGeneration=generation, currentKey=key, currentRevision=revision;
 try{change(next);const encrypted=await encrypt(currentKey,next);if(currentGeneration!==generation)return;const result=await api('vault',{vault:encrypted,revision:currentRevision});if(!data||currentGeneration!==generation)return;data=next;revision=result.revision;render();toast('Verschlüsselt auf dem Server gespeichert.');}
 catch(e){toast(e.message);}
 finally{busy=false;}
}
function bindForms() {
  const range = root.querySelector('input[type="range"]');
  if (range) range.oninput = () => range.nextElementSibling.value = range.value+' / 10';
  document.querySelector('#entry-kind')?.addEventListener('change', e => {observationKind=e.target.value; render();});
  document.querySelector('#observation-filter')?.addEventListener('change', e => {observationFilter=e.target.value; render();});
  for (const type of ['condition','observation','med']) {
    const form=document.querySelector('#'+type+'-form');
    if (!form) continue;
    form.onsubmit=async e=>{
      e.preventDefault(); if (busy) return;
      const f=new FormData(form), entry=Object.fromEntries(f), id=crypto.randomUUID();
      if (type==='condition'&&!entry.name.trim()) {toast('Bezeichnung fehlt.'); return;}
      if (type==='observation'&&observationKind==='general'&&!entry.title.trim()) {toast('Beobachtung fehlt.'); return;}
      if (type==='med') {
        const times=entry.times.split(',').map(t=>t.trim());
        if (!times.length||times.some(t=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))||new Set(times).size!==times.length) {toast('Eindeutige Uhrzeiten im Format HH:MM erforderlich.'); return;}
        entry.times=times.sort().join(', ');
        if (entry.end&&entry.end<entry.start) {toast('Enddatum liegt vor dem Startdatum.'); return;}
      }
      await mutate(d=>{
        if (type==='condition') d.conditions.push({id,name:entry.name.trim()});
        if (type==='med') d.meds.push({...entry,id});
        if (type==='observation') {
          if (observationKind==='general') d.observations.push({...entry,title:entry.title.trim(),id});
          if (observationKind==='pain') d.pain.push({...entry,id,level:Number(entry.level)});
          if (observationKind==='cycle') {
            if (d.cycles.some(c=>c.date===entry.date)) throw new Error('Für dieses Datum besteht bereits ein Menstruationseintrag.');
            d.cycles.push({...entry,id,level:Number(entry.level),symptoms:f.getAll('symptoms'),periodStart:f.has('periodStart')});
          }
        }
      });
    };
  }
}
function lock(){authMode='login';generation++;key=null;data=null;revision=null;busy=false;root.replaceChildren();authScreen();api('logout',{}).catch(()=>{});}
for(const event of ['pointerdown','keydown','touchstart'])document.addEventListener(event,()=>{if(data&&Date.now()-lastActivity>=300000)lock();lastActivity=Date.now();},{passive:true});
let hiddenAt=null;
document.addEventListener('visibilitychange',()=>{if(document.hidden)hiddenAt=Date.now();else if(data&&hiddenAt&&Date.now()-hiddenAt>=60000)lock();});
const notified=new Set();
setInterval(()=>{
 if(!data)return;
 if(Date.now()-lastActivity>300000 || (document.hidden&&hiddenAt&&Date.now()-hiddenAt>=60000)){lock();return;}
 const now=new Date(), time=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
 for(const {med,time:t} of doses()){
  const id=`${localDate()}:${med.id}:${t}`;
  if(t!==time||notified.has(id)||data.intakes.some(i=>i.medId===med.id&&i.date===localDate()&&i.time===t))continue;
  notified.add(id);toast('Eine geplante Medikamenteneinnahme ist jetzt fällig.');
  // Notification text deliberately excludes drug names and other health data.
  if('Notification'in window&&Notification.permission==='granted')navigator.serviceWorker?.ready.then(reg=>reg.showNotification('Flesh',{body:'Ein geplanter Termin ist fällig.',tag:id,icon:'/icon-192.png'})).catch(()=>{});
 }
},15000);
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
authScreen();
