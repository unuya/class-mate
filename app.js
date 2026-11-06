const TYPES = ['퀴즈·형성평가', '디지털 활동지', '탐구·시뮬레이션', '협력·토론 활동', '학습 기록', '직접 설명할게요'];
const FEATURES = ['문제 출제·편집', '자동 채점·해설', '단계별 힌트', '다시 풀기', '수준별 문제', '학습 결과 확인', '활동지 인쇄', '모둠 응답 공유', '로그인', '이미지 업로드'];
const STYLES = ['깔끔하고 미니멀', '따뜻하고 편안한', '밝고 개성 있는', '차분하고 전문적인', '어두운 다크 모드'];
const KEY = 'class-mate-draft-v1';
const fields = ['name', 'purpose', 'audience', 'details', 'pages', 'exclude', 'device', 'storage', 'conditions', 'grade', 'subject', 'topic', 'mode', 'duration'];
const form = document.querySelector('#builder-form');
let step = 0;
let toastTimer;

function addChoices(target, name, options, multiple) {
  const container = document.getElementById(target);
  options.forEach((text, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'choice';
    const input = document.createElement('input');
    input.type = multiple ? 'checkbox' : 'radio';
    input.name = name;
    input.id = `${name}-${index}`;
    input.value = text;
    input.checked = !multiple && index === 0;
    const label = document.createElement('label');
    label.htmlFor = input.id;
    label.textContent = text;
    wrapper.append(input, label);
    container.append(wrapper);
  });
}

function readValues() {
  const data = new FormData(form);
  const result = Object.fromEntries(fields.map(key => [key, String(data.get(key) || '').trim()]));
  result.type = data.get('type');
  result.style = data.get('style');
  result.features = data.getAll('feature');
  return result;
}

// Pure function: selections become a portable brief, without an AI service call.
function generatePrompt(v) {
  const features = v.features.length ? v.features.map(item => `- ${item}`).join('\n') : '- 목적에 필요한 최소 기능을 먼저 제안해주세요.';
  let storage;
  if (v.storage === '이 브라우저에 저장') storage = '브라우저 로컬 저장소를 사용합니다. 기기 간 동기화는 없으며, 데이터 삭제 시 사라질 수 있음을 안내해주세요. 비밀번호나 결제 정보를 저장하지 마세요.';
  else if (v.storage === '계정별로 온라인 저장') storage = '계정별 온라인 저장을 구현해주세요. 인증과 서버 측 접근 제어를 적용하고, 다른 사용자의 데이터에 접근할 수 없도록 하세요. 서비스 설정이 필요하면 설정 방법과 비용 조건을 설명해주세요.';
  else if (v.storage === '저장하지 않음') storage = '데이터는 현재 세션에서만 사용하고 영구 저장하지 않습니다. 새로고침하면 초기화됨을 알려주세요.';
  else storage = '구현 전에 목적에 맞는 저장 방식과 비용·복잡도를 간단히 비교하고 제안해주세요.';
  const special = [];
  if (v.features.includes('로그인') && v.storage !== '계정별로 온라인 저장') special.push('로그인이 선택되어 있지만 저장 방식이 계정별 온라인 저장이 아닙니다. 필요한 인증 범위를 먼저 확인하고, 로컬 저장만으로 실제 인증이 된다고 표현하지 마세요.');
  if (v.features.includes('이미지 업로드')) special.push('이미지는 허용 형식과 크기를 검증하고 미리보기·실패 상태를 제공하세요. 저장 방식의 용량 제약을 고려하세요.');
  if (v.features.includes('자동 채점·해설')) special.push('자동 채점은 정답과 기준이 명확한 문항에 적용하세요. 서술형은 교사 검토를 기본으로 하고, 오답에는 학습 목표에 맞는 해설을 제공하세요.');
  if (v.features.includes('모둠 응답 공유')) special.push('여러 기기에서 응답을 공유하려면 서버와 공동 저장소가 필요합니다. 로컬 저장 또는 저장하지 않음과 충돌하면 먼저 확인하고 공유 방식을 결정하세요.');
  if (v.features.includes('학습 결과 확인')) special.push('학생 자신의 결과와 교사용 학급 집계를 구분하세요. 교사용 집계는 별도 수집·접근 제어가 필요하며 로컬 데이터가 자동 공유된다고 표현하지 마세요.');
  if (v.features.includes('수준별 문제')) special.push('같은 학습 목표 안에서 난이도를 나누고 다시 선택할 수 있게 하세요. 학생 수준을 고정하거나 공개하지 마세요.');
  if (v.features.includes('활동지 인쇄')) special.push('A4 인쇄 레이아웃을 제공하고 학생용 문제와 교사용 정답·해설을 분리하세요.');
  const needsSetup = v.storage === '계정별로 온라인 저장' || v.features.includes('로그인') || v.features.includes('모둠 응답 공유');
  return `저는 바이브코딩을 처음 하는 교사이며 Gemini 교육용 계정에서 이 요청문을 사용합니다. 당신은 수업 아이디어를 실제로 작동하는 교육용 웹앱으로 만드는 파트너입니다. 설명만 하지 말고 Canvas에서 실행·미리보기 가능한 앱을 만들어주세요. Canvas를 사용할 수 없다면 그 한계를 밝히고 파일을 저장해서 실행하는 대안을 안내해주세요. 설명은 한국어로, 전문 용어 대신 교사가 할 행동을 순서대로 알려주세요.

## 1. 수업 맥락과 학습 목표
- 이름: ${v.name || '목적에 어울리는 이름을 제안해주세요'}
- 종류: ${v.type}
- 학습 목표: ${v.purpose || '[학생이 무엇을 배우거나 할 수 있어야 하는지 입력해주세요]'}
- 대상 학년: ${v.grade}
- 교과: ${v.subject}
- 단원·수업 주제: ${v.topic || '학습 목표에 맞춰 제안해주세요'}
- 사용자와 학급 특성: ${v.audience || '선택한 학년의 학생과 담당 교사'}
- 활동 방식: ${v.mode}
- 활동 시간: ${v.duration}

## 2. 학습 활동과 화면
${features}
- 구체적인 사용 흐름: ${v.details || '활동 안내 → 학습 활동 → 피드백 → 정리 흐름으로 구성해주세요.'}
- 필요한 화면: ${v.pages || '핵심 기능을 사용하는 데 필요한 최소 화면으로 구성해주세요.'}
- 제외할 범위: ${v.exclude || '요청하지 않은 기능은 임의로 추가하지 마세요.'}

## 3. 디자인과 사용성
- 분위기: ${v.style}
- 기기: ${v.device}
- 화면 문구는 한국어로 작성해주세요.
- 읽기 쉬운 글자 크기와 대비, 명확한 버튼, 일관된 간격을 사용해주세요.
- 키보드 조작과 입력 필드의 레이블을 지원해주세요.
- 빈 목록, 로딩, 오류, 작업 완료 상태를 실제 흐름에 맞게 구현해주세요.

## 4. 개발·데이터 조건
- 기본 구현: HTML·CSS·JavaScript를 담은 단일 HTML 파일을 우선 사용하세요. 패키지 설치, 터미널, 빌드 과정, 외부 라이브러리 없이 브라우저에서 실행되게 하세요.
- 첫 버전: ${needsSetup ? '선택한 로그인·온라인 저장·기기 간 공유는 단일 파일만으로 완성할 수 없습니다. 기능을 임의로 빼거나 가짜로 구현하지 말고, 먼저 한 기기에서 체험하는 버전으로 시작할지 실제 연결 설정을 진행할지 쉬운 말로 물어보세요. 실제 연결은 동의 후 필요한 설정을 안내하세요.' : '별도 회원가입·서버·API 키 없이 작동하게 하세요. 외부 서비스와 유료 기능을 임의로 추가하지 마세요.'}
- 저장 방식: ${storage}
- 추가 조건: ${v.conditions || '별도 조건 없음'}
${special.length ? '\n확인할 사항:\n' + special.map(text => '- ' + text).join('\n') + '\n' : ''}
## 5. 교육용 기본 원칙
- 선택한 학년의 읽기 수준에 맞춰 짧고 쉬운 안내와 충분한 터치 영역을 제공하세요. 색상만으로 정답·오답을 구분하지 마세요.
- 문항과 해설은 학습 목표와 연결하고 교사가 검토·수정할 수 있게 하세요. 제공되지 않은 교육과정 성취기준 번호를 임의로 만들지 마세요.
- 학생 실명, 연락처, 사진 수집을 기본값으로 요구하지 마세요. 필요한 경우 익명 별칭이나 임시 코드를 우선 고려하세요.
- 교사용 문제·정답 편집과 학생용 활동을 구분하세요. 실제 교사용 접근 제한이 필요하다면 화면 숨김만으로 보호했다고 표현하지 마세요.
- 학생 개인별 점수와 응답을 기본 공개하지 마세요. 온라인 저장 시 열람 범위와 보관·삭제 방법을 안내하세요.
- 고정 문항·규칙 기반으로 가능한 기능은 AI API 없이 구현하세요. 실시간 AI 생성이 꼭 필요하다면 별도 API·비용·키 보호가 필요함을 설명하고 결정받으세요.

## 6. 진행 방식과 완료 기준
1. 목적과 첫 버전의 범위를 짧게 정리해주세요. 요구사항이 충돌하거나 구현에 꼭 필요한 정보가 빠져 있으면 핵심 질문만 먼저 해주세요. 그 외에는 가정을 명시하고 진행해주세요.
2. 핵심 사용 흐름이 작동하는 최소 버전을 구현해주세요. 버튼과 입력이 실제로 동작하게 하고, 예시 데이터와 실제 저장 데이터를 구분해주세요.
3. 코드 조각이나 구현 계획만 주지 말고 실행 가능한 전체 앱을 완성해주세요. 예시 문항이 필요한 도구는 학습 목표에 맞는 검토용 문항과 정답·해설을 포함하세요. 교사가 문항을 화면에서 수정하고, 수정 내용을 보관하거나 내보내는 방법을 제공하세요.
4. Canvas 미리보기를 제공한 뒤, 단일 HTML로 가능한 경우 파일을 저장하고 브라우저로 여는 방법을 3단계 이내로 설명해주세요. 미리보기에서 불가능한 기능이나 외부 설정은 실제로 작동하는 것처럼 표현하지 마세요.
5. 선택된 기능, 정답·오답 처리, 다시 시작, 데이터 저장 방식, 작은 화면과 키보드 사용 흐름을 확인해주세요. 직접 실행하지 못한 검증은 그 사실을 밝혀주세요.
6. 교사가 수업 전에 눌러볼 확인 항목 3개와 다음 수정 요청 예시 2개를 제시해주세요. 구현한 내용과 남은 제약을 설명하고 Canvas 미리보기와 학생용 배포가 다름을 알려주세요. 학교 계정에서 공개 공유가 된다고 가정하지 마세요. 배포나 유료 서비스 연결은 별도 요청 전에는 진행하지 마세요.`;
}

function refresh() {
  const values = readValues();
  const prompt = generatePrompt(values);
  const setupNote = document.getElementById('setup-note');
  const needsSetup = values.storage === '계정별로 온라인 저장' || values.features.includes('로그인') || values.features.includes('모둠 응답 공유');
  setupNote.hidden = !needsSetup;
  setupNote.textContent = needsSetup ? '선택한 계정 저장·로그인·기기 간 공유에는 추가 연결 설정이 필요해요. Gemini가 먼저 쉬운 체험 버전으로 시작할지 물어보도록 요청문에 담았어요.' : ''; 
  document.getElementById('output').value = prompt;
  document.getElementById('summary').textContent = values.name || values.type;
  document.getElementById('char-count').textContent = `${prompt.length.toLocaleString('ko-KR')}자`;
  try { localStorage.setItem(KEY, JSON.stringify(values)); }
  catch { document.getElementById('save-note').textContent = '자동 저장을 사용할 수 없어요. 나가기 전에 프롬프트를 복사해주세요.'; }
}

function restore(values) {
  if (!values || typeof values !== 'object') return;
  fields.forEach(key => {
    if (typeof values[key] !== 'string') return;
    const element = form.elements.namedItem(key);
    if (element.tagName === 'SELECT' && !Array.from(element.options).some(o => o.value === values[key])) return;
    element.value = values[key];
  });
  form.querySelectorAll('[name="type"], [name="style"], [name="feature"]').forEach(input => {
    if (input.name === 'feature') input.checked = Array.isArray(values.features) && values.features.includes(input.value);
    else if (Array.from(form.querySelectorAll(`[name="${input.name}"]`)).some(option => option.value === values[input.name])) input.checked = values[input.name] === input.value;
  });
}

function showStep(index, focus = true) {
  step = index;
  document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = Number(panel.dataset.panel) !== step; });
  document.querySelectorAll('[data-step]').forEach(button => {
    if (Number(button.dataset.step) === step) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  document.getElementById('back').hidden = step === 0;
  document.getElementById('step-count').textContent = `${step + 1} / 3`;
  document.getElementById('next').textContent = ['다음: 학습 활동 →', '다음: 사용 환경 →', '프롬프트 완성하기 ↗'][step];
  if (focus) {
    const heading = document.querySelector(`[data-panel="${step}"] h2`);
    heading.tabIndex = -1;
    heading.focus();
  }
}

function validPurpose() {
  const purpose = document.getElementById('purpose');
  if (purpose.value.trim()) return true;
  showStep(0, false);
  purpose.setCustomValidity('학생들이 무엇을 배우면 좋을지 학습 목표를 한 줄로 적어주세요.');
  purpose.reportValidity();
  purpose.focus();
  return false;
}

function notify(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.textContent = ''; }, 4000);
}

addChoices('types', 'type', TYPES, false);
addChoices('features', 'feature', FEATURES, true);
addChoices('styles', 'style', STYLES, false);
try { restore(JSON.parse(localStorage.getItem(KEY))); } catch { /* Start fresh when storage is unavailable or malformed. */ }
form.addEventListener('input', () => { document.getElementById('purpose').setCustomValidity(''); refresh(); });
form.addEventListener('change', refresh);
form.addEventListener('submit', event => { event.preventDefault(); });
document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => { if (Number(button.dataset.step) === 0 || validPurpose()) showStep(Number(button.dataset.step)); }));
document.getElementById('back').addEventListener('click', () => showStep(Math.max(0, step - 1)));
document.getElementById('next').addEventListener('click', () => {
  if (!validPurpose()) return;
  if (step < 2) showStep(step + 1);
  else { refresh(); document.getElementById('copy').focus(); notify('프롬프트가 준비됐어요. 복사해서 Gemini의 Canvas에 붙여넣으세요.'); }
});
document.getElementById('example').addEventListener('click', () => {
  if (['name', 'purpose', 'audience', 'details', 'pages', 'exclude', 'topic', 'conditions'].some(key => form.elements.namedItem(key).value.trim()) && !confirm('현재 입력을 초등 수학 퀴즈 예시로 바꿀까요?')) return;
  form.reset();
  restore({"name":"분수 탐험대","type":"퀴즈·형성평가","grade":"초등 3–4학년","subject":"수학","topic":"분모가 같은 분수의 크기 비교","purpose":"그림을 보고 분모가 같은 분수의 크기를 비교하고 그 이유를 설명할 수 있어요.","audience":"초등학교 3학년 학생 25명, 학생별 태블릿 사용","mode":"학생 개인 활동","duration":"20분 내외","features":["문제 출제·편집","자동 채점·해설","단계별 힌트","다시 풀기"],"details":"그림으로 표현된 두 분수를 비교하는 5문제를 풀어요. 틀리면 힌트를 보고 다시 도전하고 마지막에 해설을 확인해요.","pages":"활동 안내, 문제 풀기, 결과와 복습, 교사용 문제 편집","exclude":"공개 순위표, 학생 회원가입, 채팅","style":"따뜻하고 편안한","conditions":"광고 없이, 고정 문항으로 API 키 없이 사용할 수 있게 해주세요."});
  document.getElementById('purpose').setCustomValidity(''); refresh(); notify('초등 수학 퀴즈 예시를 넣었어요. 자유롭게 바꿔보세요.');
});
document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('작성 중인 내용을 지우고 새로 시작할까요?')) return;
  form.reset(); document.getElementById('purpose').setCustomValidity(''); showStep(0); refresh(); notify('새로 시작할 준비가 됐어요.');
});
document.getElementById('copy').addEventListener('click', async () => {
  if (!validPurpose()) return;
  const output = document.getElementById('output');
  try { await navigator.clipboard.writeText(output.value); notify('복사했어요! Gemini의 새 대화에서 Canvas를 선택하고 붙여넣으세요.'); }
  catch { output.focus(); output.select(); notify('자동 복사를 사용할 수 없어요. 선택된 내용을 Ctrl+C 또는 ⌘C로 복사해주세요.'); }
});
document.getElementById('download').addEventListener('click', () => {
  if (!validPurpose()) return;
  const url = URL.createObjectURL(new Blob([document.getElementById('output').value], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'vibe-coding-prompt.txt'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('프롬프트 파일을 저장합니다.');
});
refresh();
