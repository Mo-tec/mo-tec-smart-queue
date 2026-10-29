const firebaseConfig = window.firebaseConfig;
const configured = window.firebaseConfigured;

const $ = id => document.getElementById(id);
let db, auth, fb, stream, scanner, scannerRunning = false, scanTimer, scanBusy = false;
let attendanceScanner, attendanceScannerRunning = false, attendanceStream, attendanceScanTimer, attendanceScanBusy = false;
let selectedAttendanceCode = '', selectedAttendanceAction = '';
const demoKey = 'motec_queue_demo_v1';
const employeeKey = 'motec_employees_demo_v1';
const attendanceKey = 'motec_attendance_demo_v1';
const demoAdminKey = 'motec_admin_demo_v1';
const services = ['Banner Printing', 'DTF / T-Shirt', 'Stickers', 'Graphic Design', 'Huduma nyingine'];
let adminVerified = false, demoAdminAuthenticated = false, staffView = false;

const day = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const part = type => parts.find(item => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const demoData = () => JSON.parse(localStorage.getItem(demoKey) || '[]');
const saveDemo = items => localStorage.setItem(demoKey, JSON.stringify(items));
const localList = key => JSON.parse(localStorage.getItem(key) || '[]');
const saveList = (key, items) => localStorage.setItem(key, JSON.stringify(items));
const canManage = () => configured ? adminVerified : demoAdminAuthenticated;
const formatArrival = value => new Intl.DateTimeFormat('sw-TZ', {
  timeZone: 'Africa/Dar_es_Salaam', hour: '2-digit', minute: '2-digit', hour12: false
}).format(new Date(value));
let customerStep = 1;

function openPage(id) {
  if (['entry', 'roles', 'customer'].includes(id)) staffView = false;
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === id));
  document.querySelectorAll('#staffNav button').forEach(button => button.classList.toggle('active', button.dataset.tab === id));
  $('staffNav').hidden = !canManage() || !staffView;
  $('connection').hidden = !canManage() || !staffView;
  $('backToEntry').hidden = id === 'entry';
  $('backToEntry').textContent = id === 'roles' ? '← RUDI KWENYE SCAN' :
    ['kiosk', 'scan'].includes(id) ? '← RUDI DASHBOARD' : '← RUDI KWENYE UCHAGUZI';
  window.scrollTo(0, 0);
}

function showAdminState() {
  const allowed = canManage();
  $('adminLoginPanel').hidden = allowed;
  $('adminWorkspace').hidden = !allowed;
  $('staffNav').hidden = !allowed || !staffView;
  $('connection').hidden = !allowed || !staffView;
  const setup = !configured && !localStorage.getItem(demoAdminKey);
  $('adminLoginTitle').textContent = setup ? 'Unda Admin wa Demo' : 'Ingia Admin';
  $('adminLoginHint').textContent = configured
    ? 'Tumia email na nywila ya akaunti ya admin iliyoidhinishwa kwenye Firebase.'
    : setup ? 'Weka email na nywila kwa majaribio kwenye browser hii.' : 'Ingia kwa email na nywila uliyoweka kwenye browser hii.';
  $('adminLogin').textContent = setup ? 'TENGENEZA AKAUNTI' : 'INGIA';
  $('adminPassword').autocomplete = setup ? 'new-password' : 'current-password';
}

async function demoPasswordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name: 'PBKDF2', salt: Uint8Array.from(salt), iterations: 100000, hash: 'SHA-256'}, key, 256);
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('');
}

function showCustomerStep(step) {
  customerStep = step;
  $('customerStart').hidden = true;
  $('registrationFormPanel').hidden = false;
  document.querySelectorAll('.customer-step').forEach(panel => {
    panel.hidden = Number(panel.dataset.step) !== step;
  });
  $('stepLabel').textContent = `Hatua ya ${step} kati ya 3`;
  $('stepFill').style.width = `${step * 100 / 3}%`;
  if (step === 3) {
    $('reviewName').textContent = $('name').value.trim();
    $('reviewPhone').textContent = $('phone').value.trim() || 'Haijawekwa';
    $('reviewService').textContent = $('service').value;
    $('reviewDetails').textContent = $('details').value.trim() || 'Hakuna';
  }
  $('registrationFormPanel').scrollIntoView({behavior: 'smooth', block: 'start'});
}

const employeeRef = code => fb.doc(db, 'employees', code);
const attendanceRef = code => fb.doc(db, 'attendance', `${day()}_${code}`);

async function previewEmployeeAttendance(code) {
  const person = await fb.getDoc(employeeRef(code));
  if (!person.exists() || person.data().active !== true) throw Error('Msimbo haujatambuliwa.');
  const record = await fb.getDoc(attendanceRef(code));
  return {name: person.data().name, arrivedAt: record.exists() ? record.data().arrivedAt?.toDate().toISOString() : null,
    leftAt: record.exists() && record.data().leftAt ? record.data().leftAt.toDate().toISOString() : null};
}

async function refreshAttendance() {
  const list = $('attendanceList');
  if (!canManage()) {
    list.textContent = 'Ingia kama admin kuona mahudhurio.';
    return;
  }
  try {
    const records = configured
      ? (await fb.getDocs(fb.query(fb.collection(db, 'attendance'), fb.where('day', '==', day())))).docs.map(doc => ({
          ...doc.data(), arrivedAt: doc.data().arrivedAt.toDate().toISOString(),
          leftAt: doc.data().leftAt?.toDate().toISOString() || null
        }))
      : localList(attendanceKey).filter(item => item.day === day());
    records.sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt));
    list.innerHTML = records.length
      ? records.map(item => `<div class="queueItem"><strong class="employee-name">${escapeHTML(item.name)}</strong><span>Ingia: ${escapeHTML(formatArrival(item.arrivedAt))}<br>Kutoka: ${item.leftAt ? escapeHTML(formatArrival(item.leftAt)) : 'Bado'}</span></div>`).join('')
      : '<p class="hint">Hakuna mfanyakazi aliyesaini leo.</p>';
  } catch (error) {
    list.textContent = 'Imeshindikana kusoma mahudhurio: ' + error.message;
  }
}

async function init() {
  // QR za kuingia hazitegemei Firebase; zionyeshe kabla ya maombi ya mtandao.
  initializeEntryQr();
  initializeRegistrationQr();
  if (configured) {
    try {
      const [app, firestore, authentication] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js'),
        import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js')
      ]);
      fb = {...firestore, ...authentication};
      const instance = app.initializeApp(firebaseConfig);
      db = firestore.getFirestore(instance);
      auth = authentication.getAuth(instance);
      const existingUser = await new Promise(resolve => {
        const unsubscribe = authentication.onAuthStateChanged(auth, user => {
          unsubscribe();
          resolve(user);
        });
      });
      if (!existingUser) await authentication.signInAnonymously(auth);
      if (auth.currentUser && !auth.currentUser.isAnonymous) {
        const approval = await fb.getDoc(fb.doc(db, 'admins', auth.currentUser.uid));
        adminVerified = approval.exists() && approval.data().enabled === true;
        if (!adminVerified) {
          await authentication.signOut(auth);
          await authentication.signInAnonymously(auth);
        }
      }
      $('connection').textContent = 'Firebase Online';
      $('connection').style.background = '#e5f8ec';
      $('connection').style.color = '#168044';
    } catch (error) {
      console.error(error);
      $('connection').textContent = 'Firebase error';
      alert('Firebase haijaunganishwa: ' + error.message);
    }
  } else {
    $('connection').textContent = 'Demo • Kifaa hiki tu';
  }
  showAdminState();
  const params = new URLSearchParams(window.location.search);
  const attendanceCode = params.get('attendance');
  if (attendanceCode) {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('attendance');
    history.replaceState(null, '', cleanUrl);
    openPage('attendance');
    await selectAttendanceCode(attendanceCode);
  } else if (params.get('register') === '1') {
    openPage('customer');
    showCustomerStep(1);
    $('name').focus({preventScroll: true});
  } else if (params.get('staff') === '1') {
    staffView = canManage();
    openPage('admin');
  } else if (params.get('entry') === '1') {
    openPage('roles');
  } else {
    openPage('entry');
  }
  await refresh();
  await refreshAttendance();
}

async function createTicket(data) {
  if (!services.includes(data.service)) throw Error('Chagua huduma iliyopo kwenye orodha.');
  if (configured) {
    if (!db || !auth?.currentUser) throw Error('Firebase haijaunganishwa.');
    const today = day();
    const counter = fb.doc(db, 'counters', today);
    return fb.runTransaction(db, async transaction => {
      const snapshot = await transaction.get(counter);
      const sequence = (snapshot.exists() ? snapshot.data().value : 0) + 1;
      const number = 'A' + String(sequence).padStart(3, '0');
      const ticketRef = fb.doc(db, 'tickets', `${today}_${number}`);
      const detailsRef = fb.doc(db, 'ticketDetails', ticketRef.id);
      const ticket = {id: ticketRef.id, number, sequence, day: today, service: data.service,
        status: 'waiting', createdAt: new Date().toISOString()};
      transaction.set(counter, {value: sequence, ticketId: ticketRef.id});
      transaction.set(ticketRef, ticket);
      transaction.set(detailsRef, {uid: auth.currentUser.uid, name: data.name, phone: data.phone, details: data.details});
      return {...ticket, ...data};
    });
  }

  const items = demoData();
  const today = day();
  const sequence = Math.max(0, ...items.filter(item => item.day === today).map(item => item.sequence || 0)) + 1;
  const ticket = {
    id: crypto.randomUUID(),
    number: 'A' + String(sequence).padStart(3, '0'),
    sequence,
    day: today,
    status: 'waiting',
    createdAt: new Date().toISOString(),
    ...data
  };
  items.push(ticket);
  saveDemo(items);
  return ticket;
}

async function loadTickets() {
  if (configured) {
    if (!db) return [];
    if (!canManage()) return [];
    const query = fb.query(fb.collection(db, 'tickets'), fb.where('day', '==', day()));
    const snapshot = await fb.getDocs(query);
    const tickets = snapshot.docs.map(document => ({id: document.id, ...document.data()}))
      .sort((first, second) => first.sequence - second.sequence);
    const details = await Promise.all(tickets.map(ticket => fb.getDoc(fb.doc(db, 'ticketDetails', ticket.id))));
    return tickets.map((ticket, index) => ({...ticket, ...(details[index].exists() ? details[index].data() : {})}));
  }
  if (!canManage()) return [];
  return demoData().filter(ticket => ticket.day === day())
    .sort((first, second) => first.sequence - second.sequence);
}

async function updateStatus(id, status) {
  if (!canManage()) throw Error('Ingia kama admin kwanza.');
  if (configured) {
    if (!['waiting', 'serving', 'done'].includes(status)) throw Error('Hali ya tiketi si sahihi.');
    await fb.updateDoc(fb.doc(db, 'tickets', id), {status, updatedAt: new Date().toISOString()});
  } else {
    const items = demoData();
    const ticket = items.find(item => item.id === id);
    if (ticket) ticket.status = status;
    saveDemo(items);
  }
  await refresh();
}

async function refresh() {
  try {
    const items = await loadTickets();
    for (const [key, filter] of [
      ['total', () => true],
      ['waiting', ticket => ticket.status === 'waiting'],
      ['serving', ticket => ticket.status === 'serving'],
      ['done', ticket => ticket.status === 'done']
    ]) {
      $(key).textContent = items.filter(filter).length;
    }
    $('queueList').innerHTML = items.length
      ? items.map(ticket => `<div class="queueItem"><div><strong>${escapeHTML(ticket.number)}</strong><div>${escapeHTML(ticket.name || 'Mteja wa Kiosk')} • ${escapeHTML(ticket.service)}</div><small>${escapeHTML(ticket.details || '')} • ${escapeHTML(ticket.status)}</small></div><div class="actions"><button class="secondary" data-ticket="${escapeHTML(ticket.id)}" data-status="serving">ITA</button><button class="secondary" data-ticket="${escapeHTML(ticket.id)}" data-status="done">MALIZA</button></div></div>`).join('')
      : '<p class="hint">Hakuna foleni zinazoonekana. Katika Firebase, admin lazima aingie kwa akaunti yenye ruhusa.</p>';
  } catch (error) {
    $('queueList').textContent = 'Imeshindikana kusoma foleni: ' + error.message;
  }
}

function showTicket(ticket) {
  $('ticketNumber').textContent = ticket.number;
  $('ticketService').textContent = ticket.service;
  $('ticketName').textContent = ticket.name || 'Mteja';
  $('ticketDate').textContent = ticket.day || day();
  $('qr').replaceChildren();
  if (window.QRCode) {
    try {
      new window.QRCode($('qr'), {
        text: ticket.number,
        width: 140,
        height: 140,
        correctLevel: window.QRCode.CorrectLevel.M
      });
    } catch (error) {
      console.error('QR code generation failed:', error);
      $('qr').textContent = `QR haikuweza kutengenezwa. Namba ya tiketi: ${ticket.number}`;
    }
  } else {
    $('qr').textContent = `QR library haipatikani. Namba ya tiketi: ${ticket.number}`;
  }
  $('ticketModal').hidden = false;
}

function initializeEntryQr() {
  const entryUrl = new URL(window.location.href);
  entryUrl.search = '';
  entryUrl.hash = '';
  entryUrl.searchParams.set('entry', '1');
  const container = $('entryQr');
  container.replaceChildren();
  if (!window.QRCode) {
    container.textContent = 'QR haipatikani. Tumia kitufe cha kuendelea.';
    return;
  }
  try {
    new window.QRCode(container, {text: entryUrl.href, width: 196, height: 196, correctLevel: window.QRCode.CorrectLevel.M});
  } catch (error) {
    container.textContent = 'QR haikuweza kutengenezwa. Tumia kitufe cha kuendelea.';
  }
}

function initializeRegistrationQr() {
  const registrationUrl = new URL(window.location.href);
  registrationUrl.search = '';
  registrationUrl.searchParams.set('register', '1');
  registrationUrl.hash = 'queueForm';
  const container = $('registrationQr');
  container.replaceChildren();
  if (!window.QRCode) {
    container.textContent = 'QR haikuweza kupakiwa. Onyesha upya ukurasa.';
    $('downloadRegistrationQr').disabled = true;
    return;
  }
  try {
    new window.QRCode(container, {
      text: registrationUrl.href,
      width: 180,
      height: 180,
      correctLevel: window.QRCode.CorrectLevel.M
    });
  } catch (error) {
    console.error('Registration QR generation failed:', error);
    container.textContent = 'QR haikuweza kutengenezwa: ' + error.message;
    $('downloadRegistrationQr').disabled = true;
  }
}

async function stopCamera() {
  clearInterval(scanTimer);
  scanTimer = undefined;
  scanBusy = false;
  if (scanner) {
    const activeScanner = scanner;
    scanner = undefined;
    if (scannerRunning) await activeScanner.stop();
    scannerRunning = false;
    await activeScanner.clear();
  }
  $('reader').hidden = true;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = undefined;
  }
  $('camera').srcObject = null;
  $('camera').hidden = true;
}

async function stopAttendanceCamera() {
  clearInterval(attendanceScanTimer);
  attendanceScanTimer = undefined;
  if (attendanceScanner) {
    const active = attendanceScanner;
    attendanceScanner = undefined;
    if (attendanceScannerRunning) await active.stop();
    attendanceScannerRunning = false;
    await active.clear();
  }
  $('attendanceReader').hidden = true;
  attendanceStream?.getTracks().forEach(track => track.stop());
  attendanceStream = undefined;
  $('attendanceCamera').srcObject = null;
  $('attendanceCamera').hidden = true;
  attendanceScanBusy = false;
}

function attendanceCodeFromScan(value) {
  const raw = value.trim();
  if (/^[A-HJ-NP-Z2-9]{16}$/i.test(raw)) return raw.toUpperCase();
  const url = new URL(raw);
  if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) throw Error('QR hii si ya mahudhurio ya mfumo huu.');
  return (url.searchParams.get('attendance') || '').toUpperCase();
}

async function selectAttendanceCode(value) {
  selectedAttendanceCode = '';
  selectedAttendanceAction = '';
  $('attendanceConfirm').hidden = true;
  $('attendanceResult').textContent = '';
  try {
    const code = attendanceCodeFromScan(value);
    if (!/^[A-HJ-NP-Z2-9]{16}$/.test(code)) throw Error('Msimbo wa QR si sahihi.');
    const employee = configured
      ? await previewEmployeeAttendance(code)
      : (() => {
          const person = localList(employeeKey).find(item => item.code === code);
          if (!person) throw Error('Msimbo haujatambuliwa.');
          const record = localList(attendanceKey).find(item => item.day === day() && item.employeeId === person.id);
          return {name: person.name, arrivedAt: record?.arrivedAt || null, leftAt: record?.leftAt || null};
        })();
    selectedAttendanceCode = code;
    $('attendanceWelcome').textContent = `Karibu, ${employee.name}`;
    if (employee.leftAt) {
      $('attendanceState').textContent = `Uliingia saa ${formatArrival(employee.arrivedAt)} na ulitoka saa ${formatArrival(employee.leftAt)} leo.`;
      $('attendanceAction').hidden = true;
    } else {
      selectedAttendanceAction = employee.arrivedAt ? 'out' : 'in';
      $('attendanceState').textContent = employee.arrivedAt
        ? `Uliingia saa ${formatArrival(employee.arrivedAt)}. Thibitisha kutoka kazini.`
        : 'Thibitisha kuingia kazini.';
      $('attendanceAction').textContent = employee.arrivedAt ? 'SAINI KUTOKA' : 'KARIBU - SAINI KUINGIA';
      $('attendanceAction').hidden = false;
    }
    $('attendanceConfirm').hidden = false;
    $('employeeCode').value = '';
  } catch (error) {
    $('attendanceResult').textContent = 'Imeshindikana kusoma QR: ' + error.message;
  }
}

$('queueForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (customerStep !== 3) return;
  const button = event.submitter || event.target.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const ticket = await createTicket({
      name: $('name').value.trim(),
      phone: $('phone').value.trim(),
      service: $('service').value,
      details: $('details').value.trim()
    });
    showTicket(ticket);
    event.target.reset();
    showCustomerStep(1);
    await refresh();
  } catch (error) {
    alert('Imeshindikana kutoa tiketi: ' + error.message);
  } finally {
    button.disabled = false;
  }
});

$('startRegistration').onclick = () => showCustomerStep(1);
$('stepOneNext').onclick = () => {
  if ($('name').reportValidity() && $('phone').reportValidity()) showCustomerStep(2);
};
$('stepTwoBack').onclick = () => showCustomerStep(1);
$('stepTwoNext').onclick = () => {
  if ($('service').reportValidity() && $('details').reportValidity()) showCustomerStep(3);
};
$('stepThreeBack').onclick = () => showCustomerStep(2);
$('backToEntry').onclick = () => {
  const current = document.querySelector('.page.active')?.id;
  if (current === 'customer' && !$('registrationFormPanel').hidden && customerStep > 1) {
    showCustomerStep(customerStep - 1);
    return;
  }
  if (current === 'roles') openPage('entry');
  else if (['kiosk', 'scan'].includes(current)) openPage('admin');
  else openPage('roles');
};
$('openRoles').onclick = () => openPage('roles');
$('chooseCustomer').onclick = () => {
  openPage('customer');
  showCustomerStep(1);
};
$('chooseAdmin').onclick = () => {
  staffView = canManage();
  showAdminState();
  openPage('admin');
};
$('chooseAttendance').onclick = () => {
  staffView = false;
  openPage('attendance');
};

$('kioskCreate').onclick = async event => {
  if (!canManage()) return alert('Ingia kama admin kwanza.');
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const ticket = await createTicket({
      name: $('kioskName').value.trim() || 'Mteja wa Kiosk',
      phone: '',
      service: $('kioskService').value,
      details: ''
    });
    showTicket(ticket);
    await refresh();
  } catch (error) {
    alert('Imeshindikana kutoa tiketi: ' + error.message);
  } finally {
    button.disabled = false;
  }
};

$('queueList').onclick = async event => {
  const button = event.target.closest('[data-ticket]');
  if (!button) return;
  if (!canManage()) {
    alert('Admin lazima aingie kwa akaunti yenye ruhusa. Tazama README.');
    return;
  }
  try {
    await updateStatus(button.dataset.ticket, button.dataset.status);
  } catch (error) {
    alert(error.message);
  }
};

$('refresh').onclick = refresh;
$('downloadEntryQr').onclick = () => {
  const canvas = $('entryQr').querySelector('canvas');
  if (!canvas) return alert('QR ya mwanzo haipatikani. Onyesha upya ukurasa.');
  const link = document.createElement('a');
  link.download = 'mo-tec-entry-qr.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
};
$('downloadRegistrationQr').onclick = () => {
  const canvas = $('registrationQr').querySelector('canvas');
  if (!canvas) {
    alert('QR bado haipatikani. Onyesha upya ukurasa.');
    return;
  }
  const download = document.createElement('a');
  download.download = 'mo-tec-queue-registration-qr.png';
  download.href = canvas.toDataURL('image/png');
  download.click();
};
$('closeModal').onclick = () => $('ticketModal').hidden = true;
$('printTicket').onclick = () => window.print();
document.querySelectorAll('nav button').forEach(button => {
  button.onclick = () => {
    if (['admin', 'kiosk', 'scan'].includes(button.dataset.tab) && !canManage()) return openPage('admin');
    openPage(button.dataset.tab);
    if (button.dataset.tab !== 'scan') {
      stopCamera().catch(error => {
        $('lookupResult').textContent = 'Imeshindikana kuzima kamera: ' + error.message;
      });
    }
    if (button.dataset.tab !== 'attendance') {
      stopAttendanceCamera().catch(error => {
        $('attendanceResult').textContent = 'Imeshindikana kuzima kamera: ' + error.message;
      });
    }
    if (button.dataset.tab === 'admin') refresh();
    if (button.dataset.tab === 'admin') refreshAttendance();
  };
});

async function lookup() {
  if (!canManage()) {
    $('lookupResult').textContent = 'Ingia kama admin kwanza.';
    return;
  }
  const number = $('ticketLookup').value.trim().toUpperCase();
  if (!number) {
    $('lookupResult').textContent = 'Ingiza au scan namba ya tiketi kwanza.';
    return;
  }
  $('lookupResult').textContent = 'Inatafuta tiketi...';
  try {
    let ticket;
    if (configured) {
      const snapshot = await fb.getDoc(fb.doc(db, 'tickets', `${day()}_${number}`));
      ticket = snapshot.exists() ? snapshot.data() : null;
    } else {
      ticket = demoData().find(item => item.number === number && item.day === day());
    }
    $('lookupResult').textContent = ticket
      ? `${ticket.number} — ${ticket.service} — ${ticket.status}`
      : 'Tiketi haijapatikana leo. Hakiki namba au tarehe.';
  } catch (error) {
    $('lookupResult').textContent = 'Imeshindikana kutafuta tiketi: ' + error.message;
  }
}

$('lookupBtn').onclick = lookup;
$('startCamera').onclick = async () => {
  try {
    await stopCamera();
  } catch (error) {
    alert('Imeshindikana kufunga scanner iliyotangulia: ' + error.message);
    return;
  }
  if (window.Html5Qrcode) {
    try {
      scanner = new window.Html5Qrcode('reader');
      $('reader').hidden = false;
      await scanner.start(
        {facingMode: 'environment'},
        {fps: 10, qrbox: {width: 250, height: 250}},
        async decodedText => {
          if (scanBusy) return;
          scanBusy = true;
          $('ticketLookup').value = decodedText.trim().toUpperCase();
          try {
            await stopCamera();
            await lookup();
          } catch (error) {
            $('lookupResult').textContent = 'Imeshindikana kusoma QR: ' + error.message;
          } finally {
            scanBusy = false;
          }
        }
      );
      scannerRunning = true;
      return;
    } catch (error) {
      await stopCamera();
      alert('Kamera haijafunguka: ' + error.message);
      return;
    }
  }
  if (!('BarcodeDetector' in window)) {
    alert('QR scanner haipatikani. Ingiza namba ya tiketi kwa mkono.');
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}});
    const video = $('camera');
    video.hidden = false;
    video.srcObject = stream;
    const detector = new BarcodeDetector({formats: ['qr_code']});
    scanTimer = setInterval(async () => {
      if (scanBusy || video.readyState < 2) return;
      scanBusy = true;
      try {
        const codes = await detector.detect(video);
        if (codes.length) {
          $('ticketLookup').value = codes[0].rawValue.trim().toUpperCase();
          await stopCamera();
          await lookup();
        }
      } catch (error) {
        await stopCamera();
        $('lookupResult').textContent = 'Imeshindikana kusoma QR: ' + error.message;
      } finally {
        scanBusy = false;
      }
    }, 500);
  } catch (error) {
    await stopCamera();
    alert('Kamera haijafunguka: ' + error.message);
  }
};

init();

$('employeeForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter || event.target.querySelector('button[type="submit"]');
  button.disabled = true;
  $('employeeCodeResult').textContent = '';
  $('employeeQrPanel').hidden = true;
  try {
    if (!canManage()) throw Error('Ingia kama admin kwanza.');
    const name = $('employeeName').value.trim();
    if (!name) throw Error('Ingiza jina la mfanyakazi.');
    let employee;
    if (configured) {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      const code = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
      await fb.setDoc(employeeRef(code), {name, active: true, createdAt: fb.serverTimestamp()});
      employee = {name, code};
    } else {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      const code = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
      employee = {id: crypto.randomUUID(), name, code};
      saveList(employeeKey, [...localList(employeeKey), employee]);
    }
    $('employeeCodeResult').textContent = `${employee.name}: msimbo ${employee.code}. Mpe QR hii mfanyakazi; itaonyeshwa mara hii pekee.`;
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('attendance', employee.code);
    const container = $('employeeQr');
    container.replaceChildren();
    if (window.QRCode) {
      new window.QRCode(container, {text: url.href, width: 180, height: 180, correctLevel: window.QRCode.CorrectLevel.M});
      $('employeeQrPanel').hidden = false;
    } else {
      $('employeeCodeResult').textContent += ' QR haipatikani sasa; onyesha upya ukurasa kabla ya kusajili mwingine.';
    }
    event.target.reset();
  } catch (error) {
    $('employeeCodeResult').textContent = 'Imeshindikana kusajili: ' + error.message;
  } finally {
    button.disabled = false;
  }
});

$('downloadEmployeeQr').onclick = () => {
  const canvas = $('employeeQr').querySelector('canvas');
  if (!canvas) {
    $('employeeCodeResult').textContent = 'QR haipatikani kwa kupakua. Onyesha upya ukurasa.';
    return;
  }
  const link = document.createElement('a');
  link.download = 'mo-tec-employee-qr.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
};

$('attendanceCodeForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter || event.target.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await selectAttendanceCode($('employeeCode').value);
  } finally {
    button.disabled = false;
  }
});

$('attendanceAction').onclick = async event => {
  const button = event.currentTarget;
  if (!selectedAttendanceCode || !selectedAttendanceAction) return;
  button.disabled = true;
  try {
    let result;
    if (configured) {
      const code = selectedAttendanceCode;
      const person = await fb.getDoc(employeeRef(code));
      if (!person.exists() || person.data().active !== true) throw Error('Msimbo haujatambuliwa.');
      const ref = attendanceRef(code);
      if (selectedAttendanceAction === 'in') {
        await fb.setDoc(ref, {code, name: person.data().name, day: day(), arrivedAt: fb.serverTimestamp()});
      } else {
        await fb.updateDoc(ref, {leftAt: fb.serverTimestamp()});
      }
      const saved = await fb.getDoc(ref);
      result = {name: person.data().name, arrivedAt: saved.data().arrivedAt.toDate().toISOString(),
        leftAt: saved.data().leftAt?.toDate().toISOString() || null};
    } else {
      const person = localList(employeeKey).find(item => item.code === selectedAttendanceCode);
      if (!person) throw Error('Msimbo haujatambuliwa.');
      const records = localList(attendanceKey);
      const record = records.find(item => item.day === day() && item.employeeId === person.id);
      if (selectedAttendanceAction === 'in') {
        if (record) throw Error('Ulishasaini kuingia leo.');
        result = {employeeId: person.id, name: person.name, day: day(), arrivedAt: new Date().toISOString()};
        records.push(result);
      } else {
        if (!record) throw Error('Saini kuingia kwanza.');
        if (record.leftAt) throw Error('Ulishasaini kutoka leo.');
        record.leftAt = new Date().toISOString();
        result = record;
      }
      saveList(attendanceKey, records);
    }
    const field = selectedAttendanceAction === 'in' ? 'arrivedAt' : 'leftAt';
    $('attendanceResult').textContent = `${result.name}, umesaini ${selectedAttendanceAction === 'in' ? 'kuingia' : 'kutoka'} saa ${formatArrival(result[field])}.`;
    $('attendanceConfirm').hidden = true;
    selectedAttendanceCode = '';
    selectedAttendanceAction = '';
    await refreshAttendance();
  } catch (error) {
    $('attendanceResult').textContent = 'Imeshindikana kusaini: ' + error.message;
  } finally {
    button.disabled = false;
  }
};

$('attendanceCancel').onclick = () => {
  selectedAttendanceCode = '';
  selectedAttendanceAction = '';
  $('attendanceConfirm').hidden = true;
  $('attendanceResult').textContent = '';
};

$('startAttendanceCamera').onclick = async () => {
  try {
    await stopAttendanceCamera();
    $('attendanceResult').textContent = '';
    if (window.Html5Qrcode) {
      attendanceScanner = new window.Html5Qrcode('attendanceReader');
      $('attendanceReader').hidden = false;
      await attendanceScanner.start({facingMode: 'environment'}, {fps: 10, qrbox: {width: 250, height: 250}}, async value => {
        if (attendanceScanBusy) return;
        attendanceScanBusy = true;
        await stopAttendanceCamera();
        await selectAttendanceCode(value);
      });
      attendanceScannerRunning = true;
      return;
    }
    if (!('BarcodeDetector' in window)) throw Error('QR scanner haipatikani. Tumia kamera ya simu kufungua QR au ingiza msimbo.');
    attendanceStream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}});
    const video = $('attendanceCamera');
    video.srcObject = attendanceStream;
    video.hidden = false;
    const detector = new BarcodeDetector({formats: ['qr_code']});
    attendanceScanTimer = setInterval(async () => {
      if (attendanceScanBusy || video.readyState < 2) return;
      attendanceScanBusy = true;
      try {
        const codes = await detector.detect(video);
        if (codes.length) {
          await stopAttendanceCamera();
          await selectAttendanceCode(codes[0].rawValue);
        }
      } catch (error) {
        $('attendanceResult').textContent = 'Imeshindikana kusoma QR: ' + error.message;
      } finally {
        attendanceScanBusy = false;
      }
    }, 500);
  } catch (error) {
    await stopAttendanceCamera();
    $('attendanceResult').textContent = 'Kamera haijafunguka: ' + error.message;
  }
};

$('attendanceRefresh').onclick = refreshAttendance;

$('adminLoginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter || $('adminLogin');
  button.disabled = true;
  $('adminLoginResult').textContent = '';
  try {
    const email = $('adminEmail').value.trim().toLowerCase();
    const password = $('adminPassword').value;
    if (configured) {
      if (!auth || !db) throw Error('Firebase haijaunganishwa. Angalia usanidi wake.');
      await fb.signInWithEmailAndPassword(auth, email, password);
      const approval = await fb.getDoc(fb.doc(db, 'admins', auth.currentUser.uid));
      if (!approval.exists() || approval.data().enabled !== true) {
        await fb.signOut(auth);
        await fb.signInAnonymously(auth);
        throw Error('Akaunti hii haina ruhusa ya admin.');
      }
      adminVerified = true;
    } else {
      const existing = JSON.parse(localStorage.getItem(demoAdminKey) || 'null');
      if (!existing) {
        const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)));
        const hash = await demoPasswordHash(password, salt);
        localStorage.setItem(demoAdminKey, JSON.stringify({email, salt, hash}));
      } else {
        const hash = await demoPasswordHash(password, existing.salt);
        if (email !== existing.email || hash !== existing.hash) throw Error('Email au nywila si sahihi.');
      }
      demoAdminAuthenticated = true;
    }
    $('adminPassword').value = '';
    staffView = true;
    showAdminState();
    openPage('admin');
    await refresh();
    await refreshAttendance();
  } catch (error) {
    $('adminLoginResult').textContent = 'Imeshindikana kuingia: ' + error.message;
  } finally {
    button.disabled = false;
  }
});

$('adminLogout').onclick = async () => {
  if (configured) {
    try {
      await fb.signOut(auth);
      await fb.signInAnonymously(auth);
    } catch (error) {
      alert('Imeshindikana kutoka: ' + error.message);
      return;
    }
  }
  adminVerified = false;
  demoAdminAuthenticated = false;
  staffView = false;
  $('employeeCodeResult').textContent = '';
  $('employeeQr').replaceChildren();
  $('employeeQrPanel').hidden = true;
  showAdminState();
  openPage('roles');
  await refresh();
  await refreshAttendance();
};
