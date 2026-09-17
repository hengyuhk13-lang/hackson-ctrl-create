// Local-only prototype: no account binding, uploads, analytics or API calls.
const riskQuestions = [
  {
    id: 'source', title: '這個工具，是從哪裡找到的？', topic: '來源驗證',
    options: [
      { value: 'ok', label: '從已核對的官方網站或商店取得' },
      { value: 'fix', label: '陌生訊息給的連結，還沒核對' },
      { value: 'unknown', label: '不清楚，需要再確認' }
    ],
    action: '先不要用陌生連結登入。從你原本知道的官方入口確認服務與網域，不用可疑訊息提供的聯絡方式反查。',
    confirmed: '你已核對來源；之後收到催促登入、付款或補助加碼的訊息，仍要重新驗證。',
    urgent: true
  },
  {
    id: 'permission', title: '你給了它哪些帳號或雲端權限？', topic: '最小權限',
    options: [
      { value: 'ok', label: '已核對，只給任務必要的權限' },
      { value: 'fix', label: '給了全部權限，尚未核對必要性' },
      { value: 'unknown', label: '沒有檢查授權範圍' }
    ],
    action: '查看已連結服務與授權範圍，撤銷不必要的讀取、刪除或代寄權限；無法限縮時，先不要連接敏感資料。',
    confirmed: '你已核對必要權限；定期查看連結服務，移除不再使用的授權。'
  },
  {
    id: 'data', title: '準備貼給 AI 的資料，包含什麼？', topic: '資料保護',
    options: [
      { value: 'ok', label: '公開資料，或已核對可使用的去識別資料' },
      { value: 'fix', label: '密鑰、可識別個資或未授權的機密內容' },
      { value: 'unknown', label: '不確定是否包含敏感資料' }
    ],
    action: '先停止上傳並移除不必要的個資、密鑰與機密。去識別後也要確認無法輕易回推個人；已送出的密鑰應撤銷並輪替。',
    confirmed: '你已檢查輸入內容；仍要尊重資料使用範圍與原持有人的授權，公開不等於可任意再利用。',
    urgent: true
  },
  {
    id: 'policy', title: '工具會怎麼保存、使用你的輸入？', topic: '保存與訓練',
    options: [
      { value: 'ok', label: '已閱讀政策，並核對適用的保存與訓練設定' },
      { value: 'fix', label: '已知設定不符合我的資料使用要求' },
      { value: 'unknown', label: '沒有讀過政策或找不到設定' }
    ],
    action: '確認適用方案的保存期限、刪除方式及是否用於訓練，再依資料需求調整設定。關閉訓練不一定等於不保存；無法確認時，不要輸入敏感內容。',
    confirmed: '你已核對政策與設定；方案或政策變更時要重新檢查，關閉訓練也不代表完全不留存。'
  },
  {
    id: 'sharing', title: 'AI 產生的文件，誰能看見？', topic: '分享範圍',
    options: [
      { value: 'ok', label: '已檢查，只讓必要對象存取' },
      { value: 'fix', label: '含敏感內容，但知道連結的人都能看' },
      { value: 'unknown', label: '不清楚文件或連結的存取設定' }
    ],
    action: '先縮小分享範圍，移除或去識別不必要的敏感內容，再只授權必要對象。不要把改檔名當成匿名化。',
    confirmed: '你已檢查存取對象；分享前再次核對內容與權限，留意連結被轉傳的可能性。'
  },
  {
    id: 'automation', title: 'AI 能不能自行存取或送出資料？', topic: '代理與提示注入',
    options: [
      { value: 'ok', label: '沒有工具權限，或敏感動作須經確認' },
      { value: 'fix', label: '可讀機密或對外傳送，卻沒有確認機制' },
      { value: 'unknown', label: '不清楚它能呼叫哪些工具' }
    ],
    action: '先停止未受控的自動執行，核對工具呼叫與存取紀錄，限制權限並加入確認機制。外部文件中的指令不應取代原任務或授權。',
    confirmed: '你已核對執行邊界；人工確認仍要看清楚資料與目的地，並將外部內容視為不可信輸入。',
    urgent: true
  }
];

const serviceConcepts = {
  identity: { title: '身分快綁', description: '規劃以 LINE Login 作為登入入口，協助減少重複填寫。年齡、設籍及其他資格的驗證，須由主管機關授權並提供適當的驗證與資料保護機制；本原型不執行資格判定。' },
  apply: { title: '一鍵申請', description: '規劃讓青年上傳收據後，透過 OCR 協助擷取品項與金額，再由申請人確認。正式服務須完成儲存權限、遮罩與審核流程設計；本原型沒有上傳或送件功能。' },
  progress: { title: '查詢進度', description: '規劃呈現資料審核、核銷與撥款等節點，並在獲得使用者同意後透過 LINE 通知。實際狀態需要串接機關案件系統；這裡沒有真實案件或模擬撥款紀錄。' },
  assistant: { title: '客服小幫手', description: '規劃先用 FAQ 處理常見問題，再以具來源依據的 RAG 助理協助複雜問題，並保留轉人工管道。現在只有原型 FAQ，沒有即時 AI 回答；政策與補助資訊仍應以官方公告為準。' }
};

let riskSummary = '';

function goToGame() {
  showScreen(state.lastGameScreen || 'intro');
}

function goToChecklist() {
  showScreen('checklist');
}

function renderRiskQuestions() {
  $('#riskQuestions').innerHTML = riskQuestions.map((question, index) => `
    <fieldset class="risk-question" id="risk-question-${question.id}">
      <legend><span class="risk-question-number">0${index + 1}</span><span>${question.title}</span></legend>
      <p class="risk-topic">${question.topic}</p>
      <div class="risk-choices">${question.options.map(option => `
        <label class="risk-choice"><input type="radio" name="risk-${question.id}" value="${option.value}" required /><span>${option.label}</span></label>`).join('')}</div>
    </fieldset>`).join('');
}

function riskAnswers() {
  return riskQuestions.map(question => ({ question, value: $(`input[name="risk-${question.id}"]:checked`)?.value || null }));
}

function updateRiskProgress() {
  const completed = riskAnswers().filter(answer => answer.value).length;
  $('#riskProgress').textContent = `已完成 ${completed}／${riskQuestions.length} 項`;
  $('#riskReport').classList.add('hidden');
  $('#riskFormError').classList.add('hidden');
  riskSummary = '';
}

function submitRiskCheck(event) {
  event.preventDefault();
  const answers = riskAnswers();
  const missing = answers.filter(answer => !answer.value);
  if (missing.length) {
    $('#riskFormError').textContent = `還有 ${missing.length} 項沒有回答。選「不清楚」也可以，我們會列出待確認的提醒。`;
    $('#riskFormError').classList.remove('hidden');
    const firstMissing = $(`input[name="risk-${missing[0].question.id}"]`);
    firstMissing.focus({ preventScroll: true });
    firstMissing.closest('fieldset').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const counts = {
    ok: answers.filter(answer => answer.value === 'ok').length,
    fix: answers.filter(answer => answer.value === 'fix').length,
    unknown: answers.filter(answer => answer.value === 'unknown').length
  };
  const urgent = answers.some(answer => answer.value === 'fix' && answer.question.urgent);
  const needsAction = counts.fix + counts.unknown > 0;
  const title = urgent ? '先暫停相關授權、上傳或自動執行' : needsAction ? '先把未確認的地方補上' : '已完成基礎檢查，使用時仍要留意';
  const badge = urgent ? '優先處理' : needsAction ? '還有下一步' : '基礎項目已確認';
  const summary = urgent
    ? '你的回答包含需要優先處理的來源、敏感資料或代理權限問題。先縮小暴露面，再依下方提醒核對設定。'
    : needsAction ? '這不是對工具的安全判定。依照你的回答，以下項目需要先調整或查清楚。'
      : '依你的自評，六項基礎事項都已確認；這不代表工具沒有風險，也不是補助或合規認證。';

  $('#riskReport').classList.toggle('urgent', urgent);
  $('#riskReport').classList.toggle('review', needsAction && !urgent);
  $('#riskReportTitle').textContent = title;
  $('#riskReportBadge').textContent = badge;
  $('#riskReportSummary').textContent = summary;
  $('#riskReportCounts').innerHTML = `<div><strong>${counts.fix}</strong><span>需調整</span></div><div><strong>${counts.unknown}</strong><span>待確認</span></div><div><strong>${counts.ok}</strong><span>已自行確認</span></div>`;

  const statusLabels = { ok: '你已自行確認', fix: '先調整', unknown: '待確認' };
  const order = { fix: 0, unknown: 1, ok: 2 };
  const sorted = [...answers].sort((a, b) => order[a.value] - order[b.value] || Number(Boolean(b.question.urgent)) - Number(Boolean(a.question.urgent)));
  $('#riskActionList').innerHTML = sorted.map(answer => `
    <article class="risk-action ${answer.value}" data-risk-item="${answer.question.id}"><div><span class="risk-action-status">${statusLabels[answer.value]}</span><h4>${answer.question.topic}</h4></div><p>${answer.value === 'ok' ? answer.question.confirmed : answer.question.action}</p></article>`).join('');
  const useCase = $('#riskUseCase').selectedOptions[0].textContent;
  riskSummary = `竹青 AI 領航盾｜AI 工具風險自評\n使用情境：${useCase}\n${title}\n需調整 ${counts.fix} 項、待確認 ${counts.unknown} 項、已自行確認 ${counts.ok} 項\n\n` + sorted.map(answer => `${answer.question.topic}（${statusLabels[answer.value]}）：${answer.value === 'ok' ? answer.question.confirmed : answer.question.action}`).join('\n') + '\n\n此結果依自行勾選的答案整理，非工具安全認證、官方審核或補助資格判定。';
  $('#riskReport').classList.remove('hidden');
  $('#riskFormError').classList.add('hidden');
  $('#riskReport').focus({ preventScroll: true });
  $('#riskReport').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('#homeLink').addEventListener('click', event => { event.preventDefault(); showScreen('portal'); });
$('#gameHomeBtn').addEventListener('click', () => showScreen('portal'));
['portalGameBtn', 'portalGameTile', 'riskGameBtn'].forEach(id => $(`#${id}`).addEventListener('click', goToGame));
['portalCheckBtn', 'portalCheckTile', 'faqCheckBtn', 'gameFinishedCheckBtn'].forEach(id => $(`#${id}`).addEventListener('click', goToChecklist));
$('#portalFaqBtn').addEventListener('click', () => showScreen('faq'));
$$('[data-demo]').forEach(button => button.addEventListener('click', () => {
  const concept = serviceConcepts[button.dataset.demo];
  $('#serviceDialogTitle').textContent = concept.title;
  $('#serviceDialogDescription').textContent = concept.description;
  $('#serviceDialog').showModal();
}));
$('#closeServiceDialog').addEventListener('click', () => $('#serviceDialog').close());
$('#serviceDialog').addEventListener('click', event => { if (event.target === $('#serviceDialog')) $('#serviceDialog').close(); });
$('#serviceDialogCheckBtn').addEventListener('click', () => { $('#serviceDialog').close(); goToChecklist(); });
$('#riskForm').addEventListener('change', updateRiskProgress);
$('#riskForm').addEventListener('submit', submitRiskCheck);
$('#riskResetBtn').addEventListener('click', () => {
  $('#riskForm').reset();
  updateRiskProgress();
  $('#riskQuestions input').focus({ preventScroll: true });
  showToast('答案已清除');
});
$('#riskEditBtn').addEventListener('click', () => {
  $('#riskReport').classList.add('hidden');
  $('#riskForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#riskQuestions input').focus({ preventScroll: true });
});
$('#riskCopyBtn').addEventListener('click', async () => {
  if (!riskSummary) return;
  try {
    await navigator.clipboard.writeText(riskSummary);
    showToast('檢核摘要已複製');
  } catch (_) {
    showToast('無法自動複製，請手動選取結果');
  }
});

renderRiskQuestions();
