
// [옵션 모듈] 게임 모드 관리자 - game-manager.js
// - 게임 오버레이 표시/닫기
// - 캐릭터 축소, 채팅창 숨김, 감정표현 + 대사 트리거
// - 각 게임별 BGM 재생/정지
// - 제거하려면 index.html의 gameOverlay 영역과 js/game-manager.js 삭제,
//   js/menu-games.js 및 notebook-menu.js 안의 game1/2/3 연동 블록도 함께 삭제하세요.

(function(){
  const overlay = document.getElementById("gameOverlay");
  const frame = document.getElementById("gameFrame");
  const closeBtn = document.getElementById("gameCloseBtn");
  // [WG_XBTN_RELOCATED] 닫기 버튼이 iframe에 가려지거나(game-frame이 위에 그려짐),
  // topbar의 pointer-events 설정 영향으로 클릭이 막히는 문제를 피하기 위해
  // 오버레이 직속(iframe 뒤)으로 이동합니다.
  try {
    if (overlay && closeBtn && closeBtn.parentElement !== overlay) {
      overlay.appendChild(closeBtn); // iframe 다음으로 이동 -> 항상 위에 보이도록
    }
  } catch(e) {}

  const chatPanel = document.getElementById("chatPanel");
  const body = document.body;

  // [게임 BGM] 각 게임별 배경 음악 관리
  const gameBgm = (function(){
    try {
      const audio = new Audio();
      audio.loop = true;
      audio.volume = 0.6;
      return audio;
    } catch(e){
      return null;
    }
  })();

  const BGM_MAP = {
    game1: "sounds/game1.mp3",
    game2: "sounds/game2.mp3",
    game3: "sounds/game3.mp3"
  };

  function playGameBgm(key){
    if (!gameBgm) return;
    const src = BGM_MAP[key];
    if (!src) return;
    try {
      gameBgm.pause();
      gameBgm.src = src;
      gameBgm.currentTime = 0;
      gameBgm.play().catch(()=>{});
    } catch(e){}
  }

  function stopGameBgm(){
    if (!gameBgm) return;
    try { gameBgm.pause(); } catch(e){}
  }

  function enterGame(url, bgmKey){
    if (!overlay || !frame) return;
    const isMessenger = (bgmKey === "messenger");

    // [순서 중요] chatPanel·body 클래스·모드 설정을 overlay 표시 전에 먼저 처리
    if (chatPanel) chatPanel.classList.add("hidden");
    if (body) body.classList.add("is-game-mode");

    try { overlay.dataset.mode = bgmKey || ""; } catch(e) {}
    // [X-only 닫기 버튼] 일부 게임(구구단/덧셈주사위/꿈틀이도형추적자/수학탐험대)에서만 외부 ✕ 표시
    const xOnly = (bgmKey === "game1" || bgmKey === "game2" || bgmKey === "game3" || bgmKey === "game4");
    try {
      if (xOnly) overlay.classList.add("x-only");
      else overlay.classList.remove("x-only");
    } catch(e) {}
    try {
      if (closeBtn) closeBtn.style.display = xOnly ? "inline-flex" : "none";
    } catch(e) {}

    // 실시간 톡 화면에서는 외부 상단바를 확실히 숨기기 위한 모드 클래스
    try {
      if (bgmKey === "messenger") {
        overlay.classList.add("mode-messenger");
        // 실시간-챗에서 캐릭터 숨김
        var _gc = document.getElementById("ghostContainer");
        if (_gc) _gc.style.setProperty("display", "none", "important");
      } else {
        overlay.classList.remove("mode-messenger");
      }
    } catch(e) {}

    const targetHref = new URL(url, location.href).href;
    const srcAlreadySet = (frame.src === targetHref);

    if (srcAlreadySet) {
      // 이미 같은 src → 바로 표시 (프리로드된 경우: 실시간톡 또는 같은 게임 재진입)
      overlay.classList.remove("hidden");
    } else {
      // src가 달라지는 경우(프리로드된 social-messenger → 게임 등):
      // iframe이 이전 페이지를 보여주는 플리커를 막기 위해
      // overlay는 hidden 유지한 채 src만 먼저 바꾸고, load 완료 후 표시
      frame.src = url;
      var _loadTimer = setTimeout(function() {
        // load 이벤트가 늦거나 안 오는 경우 대비 최대 1.5초 후 강제 표시
        overlay.classList.remove("hidden");
      }, 1500);
      frame.addEventListener("load", function _onLoad() {
        frame.removeEventListener("load", _onLoad);
        clearTimeout(_loadTimer);
        overlay.classList.remove("hidden");
      });
    }
    // Live2D 게임모드 크기 즉시 적용 (MutationObserver 타이밍 보완)
    setTimeout(function() {
      try { if (typeof window._applyLive2DGameMode === "function") window._applyLive2DGameMode(); } catch(e) {}
    }, 30);

    if (bgmKey) playGameBgm(bgmKey);

    // '실시간 톡 보기(마이파 톡)'는 게임 시작 멘트 대신 전용 안내 멘트 사용
    // - 요구사항: 아래 두 문장 중 하나만 "무작위"로 말하기 (이어 말하기/붙여 말하기 금지)
    if (isMessenger) {
      if (typeof setEmotion === "function") {
        const lines = [
          "난 잠시 조용히 있을게.",
          "마이파 톡을 열게."
        ];
        const pick = lines[Math.floor(Math.random() * lines.length)];
        try { setEmotion("미소", pick); } catch(e){}
      }
    } else {
      if (typeof window.gameReact === "function"){
        try { window.gameReact("start"); } catch(e){}
      }
    }
  }


  function isMessengerOpen(){
    try {
      return !!(overlay && !overlay.classList.contains("hidden") && (overlay.classList.contains("mode-messenger") || (overlay.dataset && overlay.dataset.mode === "messenger")));
    } catch (e) {
      return false;
    }
  }

  function sendMessengerText(text){
    if (!isMessengerOpen() || !frame || !frame.contentWindow) return false;
    var clean = String(text || "").trim();
    if (!clean) return false;
    try {
      frame.contentWindow.postMessage({ type: "WG_MESSENGER_SEND_TEXT", text: clean }, "*");
      return true;
    } catch (e) {
      return false;
    }
  }

  function routeMessengerFocusKey(ev){
    if (!isMessengerOpen() || !frame || !frame.contentWindow || !ev) return false;
    var key = String(ev.key || "");
    if (!(key === "Enter" || key === " " || key === "Spacebar")) return false;
    var active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT" || active.isContentEditable)) return false;
    try {
      frame.contentWindow.postMessage({ type: "WG_MESSENGER_FOCUS_INPUT" }, "*");
      ev.preventDefault();
      return true;
    } catch (e) {
      return false;
    }
  }

  function exitGame(){
    if (!overlay || !frame) return;
    const wasMessenger = (overlay.classList.contains("mode-messenger") || (overlay.dataset && overlay.dataset.mode === "messenger"));
    try { overlay.dataset.mode = ""; overlay.removeAttribute("data-mode"); } catch(e) {}
    
    try { overlay.classList.remove("mode-messenger"); } catch(e) {}
overlay.classList.add("hidden");
    // 메신저는 src 유지 → SignalBus 구독 유지 → 알림 계속 수신
    if (!wasMessenger) {
      frame.src = "";
      // 게임 닫은 후 메신저 백그라운드 프리로드 재실행 → SignalBus 구독 복구
      setTimeout(function() {
        try {
          var ov2 = document.getElementById("gameOverlay");
          if (ov2 && ov2.classList.contains("hidden") &&
              frame.src.indexOf("social-messenger") === -1) {
            frame.src = "games/social-messenger.html";
          }
        } catch(e) {}
      }, 500);
    }
    stopGameBgm();

    if (chatPanel) chatPanel.classList.remove("hidden");
    if (body) body.classList.remove("is-game-mode");
    // 캐릭터 복원 (messenger 모드에서 숨겼을 수 있음)
    var _gcExit = document.getElementById("ghostContainer");
    if (_gcExit) _gcExit.style.removeProperty("display");

    // [마이파 톡 예외] 닫을 때는 다른 게임들과 달리 "닫힘 대사"를 치지 않기
    // - 즉시 조용히 기본대기 표정으로 복귀 (말풍선 없이)
    if (wasMessenger && typeof setEmotion === "function"){
      try { setEmotion("기본대기", null, { silent: true }); } catch(e){}
    }

    // 종료 멘트 + 감정 표현 (실시간 톡은 끌 때 아무 말도 하지 않음)
    if (!wasMessenger && typeof window.gameReact === "function"){
      try { window.gameReact("exit"); } catch(e){}
    }

    // 혹시 다른 모듈에서 감정을 바꾸더라도,
    // 일정 시간이 지나면 강제로 기본대기로 한 번 더 복귀시킵니다.
    if (typeof setEmotion === "function"){
      // 실시간 톡(마이파 톡)은 닫을 때 캐릭터가 "대사"를 치지 않도록 조용히 복귀
      // - 기존: "기본대기"로 돌릴 때 빈 문자열(" ")이 들어가면 랜덤 대사가 나올 수 있음
      // - 해결: wasMessenger인 경우 silent 옵션으로 표정만 복귀
      setTimeout(function(){
        try {
          if (wasMessenger) setEmotion("기본대기", null, { silent: true });
          else setEmotion("기본대기", "");
        } catch(e){}
      }, 6000);
    }
  }

  if (closeBtn){
    closeBtn.addEventListener("click", exitGame);
  }

  document.addEventListener("keydown", routeMessengerFocusKey, true);

  window.launchGame1 = function(){ enterGame("games/구구단게임.html","game1"); };
  window.launchGame2 = function(){ enterGame("games/덧셈주사위.html","game2"); };
  window.launchGame3 = function(){ enterGame("games/꿈틀이도형추적자.html","game3"); };
  window.launchGame4 = function(){ enterGame("games/math-explorer.html","game4"); };
  window.launchMessenger = function(){ enterGame("games/social-messenger.html","messenger"); };

  window.exitGame = exitGame;
  window.isMessengerOpen = isMessengerOpen;
  window.sendMessengerText = sendMessengerText;

  // iframe(게임/실시간 톡) 내부에서 닫기 요청이 오는 경우(postMessage)
  window.addEventListener("message", function(ev){
    const data = ev && ev.data;
    if (!data) return;
    // {type:"WG_EXIT_GAME"} 또는 문자열 형태 모두 지원
    if (data === "WG_EXIT_GAME" || (typeof data === "object" && data.type === "WG_EXIT_GAME")) {
      exitGame();
    }
  });

})();
