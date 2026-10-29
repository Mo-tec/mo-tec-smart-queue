const $ = id => document.getElementById(id);
const zone = 'Africa/Dar_es_Salaam';
const today = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date());
  const part = type => parts.find(item => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
let loading = false;
let lastSignature = '';

function draw(tickets) {
  const serving = tickets.filter(ticket => ticket.status === 'serving').sort((a, b) =>
    String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0];
  const waiting = tickets.filter(ticket => ticket.status === 'waiting').sort((a, b) => a.sequence - b.sequence).slice(0, 5);
  $('currentNumber').textContent = serving?.number || '—';
  $('currentService').textContent = serving?.service || 'Subiri namba yako iitwe';
  $('nextList').replaceChildren();
  if (!waiting.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Hakuna wanaosubiri sasa';
    $('nextList').append(empty);
  }
  for (const ticket of waiting) {
    const row = document.createElement('div');
    row.className = 'next-item';
    const number = document.createElement('strong');
    number.textContent = ticket.number;
    const service = document.createElement('span');
    service.textContent = ticket.service;
    row.append(number, service);
    $('nextList').append(row);
  }
  const signature = serving ? `${serving.number}:${serving.updatedAt || serving.createdAt}` : '';
  if (signature && signature !== lastSignature) {
    $('currentNumber').animate([{opacity: .3, transform: 'scale(.9)'}, {opacity: 1, transform: 'scale(1)'}], {duration: 600});
  }
  lastSignature = signature;
  $('displayStatus').textContent = `Imesasishwa ${new Intl.DateTimeFormat('sw-TZ', {timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit'}).format(new Date())}`;
}

async function refresh() {
  if (loading) return;
  loading = true;
  try {
    const tickets = JSON.parse(localStorage.getItem('motec_queue_demo_v1') || '[]').filter(ticket => ticket.day === today());
    draw(tickets);
  } catch (error) {
    $('displayStatus').textContent = 'Muunganisho umekatika; inajaribu tena...';
    console.error('TV queue refresh failed:', error);
  } finally {
    loading = false;
  }
}

async function start() {
  if (window.firebaseConfigured) {
    try {
      const [{initializeApp}, {getFirestore, collection, query, where, onSnapshot}] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js')
      ]);
      const db = getFirestore(initializeApp(window.firebaseConfig));
      let currentDay = today();
      let unsubscribe = () => {};
      const listen = () => {
        unsubscribe();
        currentDay = today();
        unsubscribe = onSnapshot(query(collection(db, 'tickets'), where('day', '==', currentDay)),
          snapshot => draw(snapshot.docs.map(doc => doc.data())),
          error => { $('displayStatus').textContent = 'Muunganisho umekatika; fungua upya ukurasa.'; console.error(error); });
      };
      listen();
      setInterval(() => { if (today() !== currentDay) listen(); }, 60000);
    } catch (error) {
      $('displayStatus').textContent = 'Firebase haijaunganishwa';
      console.error(error);
    }
  } else {
    $('displayStatus').textContent = 'Demo: TV na admin tumia browser hii';
    await refresh();
    setInterval(refresh, 5000);
  }
}
setInterval(() => $('clock').textContent = new Intl.DateTimeFormat('sw-TZ', {timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date()), 1000);
window.addEventListener('storage', event => { if (event.key === 'motec_queue_demo_v1') refresh(); });
start();
