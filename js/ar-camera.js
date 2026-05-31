// ar-camera.js - [옵션 모듈] AR 카메라 + QR 스캔 + 스티커 모드
// - 수첩(메뉴)의 "AR 카메라" 메모지를 눌렀을 때 실행되는 카메라 도구입니다.
// - 일반 카메라 미리보기, QR 코드 스캔, 간단한 스티커(이모지) 오버레이 기능을 한 화면에서 제공합니다.
//
// 이 모듈을 사용하지 않으려면:
// 1) index.html 안의 `<script src="js/ar-camera.js"></script>` 한 줄을 삭제하고
// 2) js/ar-camera.js 파일을 삭제한 뒤
// 3) js/notebook-menu.js 안의 `case "arcamera"` 블록을 삭제하면
//    AR 카메라 관련 기능과 메뉴 항목 연동이 모두 사라집니다.
//
// ※ 주의: 이 모듈은 브라우저의 카메라 권한을 요구합니다.
//   - https(보안 연결) 환경에서만 정상 동작하는 브라우저들이 많습니다.
//   - 권한이 거부되면 안내 문구만 표시됩니다.
//
// v46 확장:
// - QR 코드를 인식하면, URL일 경우 즉시 해당 주소로 이동합니다.
// - 셔터 버튼을 누르면 카메라 화면을 캔버스로 캡처하고,
//   스티커 모드에서는 화면에 붙인 이모지 스티커까지 같이 그려서
//   자동으로 PNG 파일로 다운로드합니다.

(function(){
  const OVERLAY_ID = "ar-camera-overlay";
  const STYLE_ID = "ar-camera-style";

  let overlayEl = null;
  let videoEl = null;
  let canvasEl = null;
  let canvasCtx = null;
  let modeLabelEl = null;
  let infoLabelEl = null;
  let currentMode = "camera"; // "camera" | "qr" | "sticker"
  let currentStickerChar = "⭐";
  let stickerLayerEl = null;
  let charLayerEl = null;
  let charImgEl = null;

  let mediaStream = null;
  let qrAnimationId = null;
  let qrLibLoaded = false;
  let qrLibLoading = false;

  // 1D 바코드(UPC/EAN 등)까지 읽기 위한 ZXing 브라우저 리더
  let barcodeLibLoaded = false;
  let barcodeLibLoading = false;
  let barcodeReader = null;

  function injectStylesOnce(){
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID} {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(4,10,20,0.82);
        backdrop-filter: blur(4px);
      }
      #${OVERLAY_ID}.hidden {
        display: none;
      }
      .ar-camera-panel {
        position: relative;
        width: min(480px, 92vw);
        height: min(640px, 86vh);
        background: rgba(7,16,30,0.96);
        border-radius: 20px;
        box-shadow: 0 10px 28px rgba(0,0,0,0.55);
        padding: 14px 14px 12px;
        display: flex;
        flex-direction: column;
        color: #f5f7ff;
        font-size: 13px;
      }
      .ar-camera-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
      }
      .ar-camera-title {
        font-size: 15px;
        font-weight: 700;
      }
      .ar-camera-mode-label {
        font-size: 11px;
        opacity: 0.9;
      }
      .ar-camera-close-btn {
        border: none;
        outline: none;
        width: 26px;
        height: 26px;
        border-radius: 999px;
        cursor: pointer;
        background: rgba(255,255,255,0.05);
      }
      .ar-camera-close-btn:hover {
        background: rgba(255,255,255,0.12);
      }
      .ar-camera-view {
        position: relative;
        flex: 1;
        border-radius: 14px;
        overflow: hidden;
        background: #000;
      }
      .ar-camera-video,
      .ar-camera-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .ar-camera-sticker-layer {
        position: absolute;
        inset: 0;
        pointer-events: auto;
      }
      .ar-camera-char-layer {
        position: absolute;
        left: 0;
        bottom: 0;
        pointer-events: none;
        display: none; /* 기본은 숨김: 스티커(AR) 모드에서만 보이게 */
      }
      .ar-camera-char-layer img.ar-camera-char-img {
        max-width: 43%;
        max-height: 60%;
        object-fit: contain;
        transform-origin: bottom left;
        transform: scale(1.0);
        filter: drop-shadow(0 6px 14px rgba(0,0,0,0.55));
      }

      .ar-camera-sticker {
        position: absolute;
        transform: translate(-50%, -50%);
        font-size: 32px;
        user-select: none;
        pointer-events: none;
      }
      .ar-camera-info {
        margin-top: 6px;
        min-height: 1.4em;
        font-size: 11px;
        opacity: 0.88;
      }
      .ar-camera-controls {
        margin-top: 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      .ar-camera-mode-group {
        display: flex;
        gap: 4px;
      }
      .ar-camera-mode-btn {
        border: none;
        outline: none;
        padding: 6px 8px;
        font-size: 11px;
        border-radius: 999px;
        background: rgba(255,255,255,0.06);
        color: #f7f9ff;
        cursor: pointer;
        white-space: nowrap;
      }
      .ar-camera-mode-btn.active {
        background: #4194ff;
        color: #ffffff;
      }
      .ar-camera-action-group {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .ar-camera-main-btn {
        border-radius: 999px;
        width: 44px;
        height: 44px;
        border: 2px solid rgba(255,255,255,0.9);
        background: radial-gradient(circle at 30% 30%, #ffffff, #dde3ff);
        cursor: pointer;
        outline: none;
      }
      .ar-camera-main-btn:active {
        transform: scale(0.95);
      }
      .ar-camera-sticker-choices {
        display: flex;
        gap: 4px;
        font-size: 18px;
      }
      .ar-camera-sticker-choices button {
        border: none;
        outline: none;
        width: 26px;
        height: 26px;
        border-radius: 999px;
        background: rgba(255,255,255,0.06);
        cursor: pointer;
      }
      .ar-camera-sticker-choices button.active {
        background: rgba(255,255,255,0.2);
      }
      @media (max-width: 480px) {
        .ar-camera-panel {
          width: 94vw;
          height: 84vh;
          padding: 12px 10px 10px;
        }
        .ar-camera-title {
          font-size: 14px;
        }
        .ar-camera-main-btn {
          width: 40px;
          height: 40px;
        }
        .ar-camera-sticker {
          font-size: 28px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createOverlayOnce(){
    if (overlayEl) return;

    injectStylesOnce();

    overlayEl = document.createElement("div");
    overlayEl.id = OVERLAY_ID;
    overlayEl.className = "hidden";

    const panel = document.createElement("div");
    panel.className = "ar-camera-panel";

    const header = document.createElement("div");
    header.className = "ar-camera-header";

    const title = document.createElement("div");
    title.className = "ar-camera-title";
    title.textContent = "AR 카메라";

    modeLabelEl = document.createElement("div");
    modeLabelEl.className = "ar-camera-mode-label";

    const closeBtn = document.createElement("button");
    closeBtn.className = "ar-camera-close-btn";
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", closeOverlay);

    header.appendChild(title);
    const rightHeader = document.createElement("div");
    rightHeader.style.display = "flex";
    rightHeader.style.alignItems = "center";
    rightHeader.style.gap = "6px";
    rightHeader.appendChild(modeLabelEl);
    rightHeader.appendChild(closeBtn);
    header.appendChild(rightHeader);

    const view = document.createElement("div");
    view.className = "ar-camera-view";

    videoEl = document.createElement("video");
    videoEl.className = "ar-camera-video";
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.muted = true;

    canvasEl = document.createElement("canvas");
    canvasEl.className = "ar-camera-canvas";
    canvasCtx = canvasEl.getContext("2d");

    stickerLayerEl = document.createElement("div");
    stickerLayerEl.className = "ar-camera-sticker-layer";

    charLayerEl = document.createElement("div");
    charLayerEl.className = "ar-camera-char-layer";

    view.appendChild(videoEl);
    view.appendChild(canvasEl);
    view.appendChild(stickerLayerEl);
    view.appendChild(charLayerEl);

    // 현재 캐릭터 스프라이트를 AR 카메라 위에 같이 표시
    try {
      updateCharacterSprite();
      try { window.__updateARCharacterSprite = updateCharacterSprite; } catch(e) {}
    } catch(e) {
      console.warn("updateCharacterSprite error:", e);
    }

    view.addEventListener("click", function(evt){
      if (currentMode !== "sticker") return;
      const rect = view.getBoundingClientRect();
      const x = evt.clientX - rect.left;
      const y = evt.clientY - rect.top;

      const span = document.createElement("span");
      span.className = "ar-camera-sticker";
      span.textContent = currentStickerChar;
      span.style.left = (x / rect.width * 100) + "%";
      span.style.top = (y / rect.height * 100) + "%";
      stickerLayerEl.appendChild(span);
    });

    infoLabelEl = document.createElement("div");
    infoLabelEl.className = "ar-camera-info";

    const controls = document.createElement("div");
    controls.className = "ar-camera-controls";

    const modeGroup = document.createElement("div");
    modeGroup.className = "ar-camera-mode-group";

    const btnCamera = document.createElement("button");
    btnCamera.className = "ar-camera-mode-btn";
    btnCamera.textContent = "카메라";
    btnCamera.addEventListener("click", function(){ setMode("camera"); });

    const btnQR = document.createElement("button");
    btnQR.className = "ar-camera-mode-btn";
    btnQR.textContent = "QR 스캔";
    btnQR.addEventListener("click", function(){ setMode("qr"); });

    const btnStickerMode = document.createElement("button");
    btnStickerMode.className = "ar-camera-mode-btn";
    btnStickerMode.textContent = "스티커";
    btnStickerMode.addEventListener("click", function(){ setMode("sticker"); });

    modeGroup.appendChild(btnCamera);
    modeGroup.appendChild(btnQR);
    modeGroup.appendChild(btnStickerMode);

    const actionGroup = document.createElement("div");
    actionGroup.className = "ar-camera-action-group";

    const shutterBtn = document.createElement("button");
    shutterBtn.className = "ar-camera-main-btn";
    shutterBtn.addEventListener("click", handleShutterClick);

    const stickerChoices = document.createElement("div");
    stickerChoices.className = "ar-camera-sticker-choices";

    const stickerChars = ["👻", "⭐", "🎵", "😄"];
    stickerChars.forEach(function(ch, idx){
      const b = document.createElement("button");
      b.textContent = ch;
      if (idx === 0) {
        b.classList.add("active");
      }
      b.addEventListener("click", function(){
        currentStickerChar = ch;
        Array.from(stickerChoices.children).forEach(function(btn){
          btn.classList.remove("active");
        });
        b.classList.add("active");
      });
      stickerChoices.appendChild(b);
    });

    actionGroup.appendChild(shutterBtn);
    actionGroup.appendChild(stickerChoices);

    controls.appendChild(modeGroup);
    controls.appendChild(actionGroup);

    panel.appendChild(header);
    panel.appendChild(view);
    panel.appendChild(infoLabelEl);
    panel.appendChild(controls);

    overlayEl.appendChild(panel);
    document.body.appendChild(overlayEl);

    // mode 버튼 참조 저장
    modeGroup._buttons = { camera: btnCamera, qr: btnQR, sticker: btnStickerMode };
  }

  function openOverlay(){
    createOverlayOnce();
    overlayEl.classList.remove("hidden");
    startCamera();
    setMode(currentMode || "camera");
  }

  function closeOverlay(){
    if (!overlayEl) return;
    overlayEl.classList.add("hidden");
    stopCamera();
    stopQrLoop();
  }

  function setMode(mode){
    currentMode = mode;

    if (!overlayEl || !overlayEl.querySelector(".ar-camera-mode-group")) return;
    const group = overlayEl.querySelector(".ar-camera-mode-group");
    if (group._buttons) {
      Object.keys(group._buttons).forEach(function(key){
        group._buttons[key].classList.toggle("active", key === mode);
      });
    }

    if (modeLabelEl) {
      if (mode === "camera") {
        modeLabelEl.textContent = "일반 카메라 모드";
      } else if (mode === "qr") {
        modeLabelEl.textContent = "QR 코드 스캔 모드";
      } else {
        modeLabelEl.textContent = "스티커 장난 모드";
      }
    }

    if (infoLabelEl) {
      if (mode === "camera") {
        infoLabelEl.textContent = "사진을 찍으면 현재 화면이 캡처되고, 자동으로 PNG 파일로 저장됩니다.";
      } else if (mode === "qr") {
        infoLabelEl.textContent = "카메라를 QR 코드에 맞춰 주세요. URL이 들어있는 코드는 읽자마자 바로 이동합니다.";
      } else {
        infoLabelEl.textContent = "화면을 톡톡 눌러 스티커를 붙인 뒤, 셔터를 누르면 스티커까지 포함해서 사진이 저장됩니다.";
      }
    }


    // 캐릭터 레이어는 스티커(AR) 모드에서만 표시
    if (charLayerEl) {
      if (mode === "sticker") {
        charLayerEl.style.display = "block";
      } else {
        charLayerEl.style.display = "none";
      }
    }

    if (mode === "qr") {
      startQrLoop();
    } else {
      stopQrLoop();
    }

    if (mode === "sticker" && stickerLayerEl) {
      Array.from(stickerLayerEl.children).forEach(function(n){
        if (n && n.parentNode === stickerLayerEl) {
          stickerLayerEl.removeChild(n);
        }
      });
    }
  }

  function handleShutterClick(){
    if (!canvasEl || !canvasCtx || !videoEl) return;
    if (!videoEl.videoWidth || !videoEl.videoHeight) {
      if (infoLabelEl) infoLabelEl.textContent = "아직 카메라 준비 중이에요. 조금만 기다렸다가 다시 눌러 주세요.";
      return;
    }

    // 1) 비디오 프레임을 캔버스로 캡처
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
    canvasCtx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);

    // 2) 스티커 모드라면, 스티커 레이어의 이모지를 캔버스에 같이 그림
    if (currentMode === "sticker" && stickerLayerEl) {
      const stickers = Array.from(stickerLayerEl.children);
      if (stickers.length > 0) {
        canvasCtx.textAlign = "center";
        canvasCtx.textBaseline = "middle";
        canvasCtx.font = Math.round(canvasEl.width * 0.06) + "px system-ui, 'Apple Color Emoji', 'Noto Color Emoji'";
        stickers.forEach(function(node){
          if (!node || !node.classList || !node.classList.contains("ar-camera-sticker")) return;
          const text = node.textContent || "";
          const leftPercent = parseFloat((node.style.left || "50%").replace("%","")) || 50;
          const topPercent  = parseFloat((node.style.top  || "50%").replace("%","")) || 50;
          const x = canvasEl.width  * (leftPercent / 100);
          const y = canvasEl.height * (topPercent  / 100);
          canvasCtx.fillText(text, x, y);
        });
      }
    }

    if (infoLabelEl) {
      if (currentMode === "camera") {
        infoLabelEl.textContent = "현재 화면을 캡처했어요. PNG 파일로 자동 저장을 시도합니다.";
      } else if (currentMode === "qr") {
        infoLabelEl.textContent = "이 화면에서 QR 코드가 잘 보이는지 확인해 볼게요. (URL이면 곧바로 이동합니다)";
      } else {
        infoLabelEl.textContent = "스티커까지 포함해서 이미지를 만들었어요. PNG 파일로 자동 저장을 시도합니다.";
      }
    }

    // 3) QR 모드라면, 한 번 더 QR 분석 시도
    if (currentMode === "qr") {
      tryRunQrOnce();
    }

    // 4) 캔버스를 PNG로 자동 다운로드
    saveCanvasImage();
  }

  function saveCanvasImage(){
    if (!canvasEl) return;
    try {
      const dataUrl = canvasEl.toDataURL("image/png");
      const link = document.createElement("a");
      const now = new Date();
      const pad = function(n){ return String(n).padStart(2, "0"); };
      const filename = "ghost_ar_" +
        now.getFullYear() +
        pad(now.getMonth() + 1) +
        pad(now.getDate()) + "_" +
        pad(now.getHours()) +
        pad(now.getMinutes()) +
        pad(now.getSeconds()) +
        ".png";

      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.warn("saveCanvasImage error:", e);
    }
  }

  
  function updateCharacterSprite(){
    try {
      if (!charLayerEl) return;
      // Live2D 활성화 중에는 정적 이미지 사용 안 함 → 404 요청 차단
      if (window._live2dActive) return;
      var base = "images/emotions/기본대기1.png";
      var src = base;

      try {
        if (typeof window.getCharImagePath === "function") {
          src = window.getCharImagePath(base);
        }
      } catch(e) {
        // ignore and use base
      }

      if (!charImgEl) {
        charImgEl = document.createElement("img");
        charImgEl.className = "ar-camera-char-img";
        charLayerEl.appendChild(charImgEl);
      }
      charImgEl.src = src;
    } catch(e) {
      console.warn("updateCharacterSprite failed:", e);
    }
  }

function startCamera(){
    if (mediaStream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (infoLabelEl) {
        infoLabelEl.textContent = "이 브라우저에서는 카메라 기능을 사용할 수 없어요.";
      }
      if (typeof showBubble === "function") {
        try { showBubble("이 기기나 브라우저에서는 카메라 권한을 줄 수 없어서 AR 기능을 쓸 수 없어요."); } catch(e){}
      }
      return;
    }

    const constraints = {
      video: {
        facingMode: { ideal: "environment" }
      },
      audio: false
    };

    navigator.mediaDevices.getUserMedia(constraints).then(function(stream){
      mediaStream = stream;
      if (videoEl) {
        videoEl.srcObject = stream;
      }
      if (infoLabelEl) {
        infoLabelEl.textContent = "카메라 준비 중... QR코드나 스티커로 놀아 볼까요?";
      }
    }).catch(function(err){
      if (infoLabelEl) {
        infoLabelEl.textContent = "카메라에 접근할 수 없어요. 권한 설정을 확인해 주세요.";
      }
      if (typeof showBubble === "function") {
        try { showBubble("카메라 권한이 거부되었거나 사용할 수 없어요. 브라우저 설정을 확인해 주세요."); } catch(e){}
      }
      console.warn("AR camera getUserMedia error:", err);
    });
  }

  function stopCamera(){
    if (mediaStream) {
      mediaStream.getTracks().forEach(function(track){
        try { track.stop(); } catch(e){}
      });
      mediaStream = null;
    }
    if (videoEl) {
      videoEl.srcObject = null;
    }
  }

  function ensureQrLib(){
    if (qrLibLoaded || qrLibLoading) return;
    qrLibLoading = true;
    const s = document.createElement("script");
    s.src = "https://unpkg.com/jsqr/dist/jsQR.js";
    s.async = true;
    s.onload = function(){
      qrLibLoaded = true;
      qrLibLoading = false;
      if (infoLabelEl && currentMode === "qr") {
        infoLabelEl.textContent = "QR 라이브러리를 불러왔어요. 코드에 카메라를 가까이 가져가 주세요.";
      }
    };
    s.onerror = function(){
      qrLibLoading = false;
      if (infoLabelEl && currentMode === "qr") {
        infoLabelEl.textContent = "QR 라이브러리를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";
      }
    };
    document.head.appendChild(s);
  }


  function ensureBarcodeLib(){
    if (barcodeLibLoaded || barcodeLibLoading) return;
    barcodeLibLoading = true;
    const s = document.createElement("script");
    // ZXing 브라우저 레이어 (1D/2D 바코드 모두 지원)
    s.src = "https://unpkg.com/@zxing/browser@latest";
    s.async = true;
    s.onload = function(){
      barcodeLibLoaded = true;
      barcodeLibLoading = false;
      if (infoLabelEl && currentMode === "qr") {
        infoLabelEl.textContent = "QR/바코드 라이브러리를 불러왔어요. 코드에 카메라를 가까이 가져가 주세요.";
      }
    };
    s.onerror = function(){
      barcodeLibLoading = false;
      console.warn("바코드 라이브러리를 불러오지 못했어요.");
    };
    document.head.appendChild(s);
  }

  
  function handleScannedData(data, label){
    try {
      if (!data) return;
      var text = String(data || "");
      var prefix = label || "코드";
      if (infoLabelEl) {
        infoLabelEl.textContent = prefix + " 인식: " + text;
      }
      if (typeof showBubble === "function") {
        try { showBubble(prefix + "를 읽었어요: " + text); } catch(e){}
      }

      // URL 형식이면 즉시 해당 주소로 이동
      var isUrl = /^https?:\/\//i.test(text) || /^www\./i.test(text);
      if (isUrl) {
        if (!/^https?:\/\//i.test(text)) {
          text = "https://" + text.replace(/^www\./i, "www.");
        }
        try {
          window.location.href = text;
        } catch (e) {
          console.warn("QR/barcode redirect error:", e);
        }
      }

      // 인식 후에는 루프를 잠시 멈췄다가, 여전히 QR 모드라면 재시작
      setTimeout(function(){
        if (currentMode === "qr") {
          startQrLoop();
        }
      }, 1500);
    } catch(e) {
      console.warn("handleScannedData error:", e);
    }
  }

function startQrLoop(){
    ensureQrLib();
    ensureBarcodeLib();
    if (qrAnimationId) return;
    if (!canvasEl || !canvasCtx || !videoEl) return;

    const tick = function(){
      qrAnimationId = null;
      if (!overlayEl || overlayEl.classList.contains("hidden")) {
        return;
      }
      if (currentMode !== "qr") {
        return;
      }

      if (videoEl.readyState >= 2) {
        if (videoEl.videoWidth && videoEl.videoHeight) {
          canvasEl.width = videoEl.videoWidth;
          canvasEl.height = videoEl.videoHeight;
          canvasCtx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
        }


        if (qrLibLoaded && window.jsQR && canvasEl.width && canvasEl.height) {
          try {
            const imageData = canvasCtx.getImageData(0, 0, canvasEl.width, canvasEl.height);
            const code = window.jsQR(imageData.data, canvasEl.width, canvasEl.height);
            if (code && code.data) {
              handleScannedData(code.data, "QR 코드");
              return;
            }
          } catch (e) {
            console.warn("QR scan error:", e);
          }
        }

        // QR에서 못 찾았으면 1D/2D 바코드(UPC/EAN 등)까지 포함한 ZXing 브라우저 리더로 한 번 더 시도
        if (barcodeLibLoaded && window.ZXingBrowser && canvasEl.width && canvasEl.height) {
          try {
            if (!barcodeReader && window.ZXingBrowser.BrowserMultiFormatReader) {
              barcodeReader = new window.ZXingBrowser.BrowserMultiFormatReader();
            }
          } catch (e) {
            console.warn("바코드 리더 생성 실패:", e);
          }

          if (barcodeReader && typeof barcodeReader.decodeFromCanvas === "function") {
            try {
              var p = barcodeReader.decodeFromCanvas(canvasEl);
              if (p && typeof p.then === "function") {
                p.then(function (result) {
                  if (!result) {
                    if (currentMode === "qr") {
                      qrAnimationId = requestAnimationFrame(tick);
                    }
                    return;
                  }
                  var text = result.text || (result.getText && result.getText()) || "";
                  if (text) {
                    handleScannedData(text, "바코드");
                  } else if (currentMode === "qr") {
                    qrAnimationId = requestAnimationFrame(tick);
                  }
                }).catch(function (err) {
                  // 인식 실패 시 다음 프레임에서 다시 시도
                  if (currentMode === "qr") {
                    qrAnimationId = requestAnimationFrame(tick);
                  }
                });
              } else {
                // Promise 가 아닌 경우도 혹시 모를 예외 처리
                if (currentMode === "qr") {
                  qrAnimationId = requestAnimationFrame(tick);
                }
              }
            } catch (e) {
              // 디코딩 중 예외 발생 시 다음 프레임에서 다시 시도
              if (currentMode === "qr") {
                qrAnimationId = requestAnimationFrame(tick);
              }
            }
            return;
          }
        }

        // 여기까지 와도 인식 못하면 간단 안내만 표시
        if (currentMode === "qr" && infoLabelEl && !qrLibLoading && !barcodeLibLoading) {
          infoLabelEl.textContent = "QR/바코드를 찾는 중이에요. 코드가 화면에 잘 보이도록 맞춰 주세요.";
        } else if (currentMode === "qr" && infoLabelEl && !qrLibLoading) {
          infoLabelEl.textContent = "QR 라이브러리를 준비하는 중이에요...";
          ensureQrLib();
        }
      }

      qrAnimationId = requestAnimationFrame(tick);
    };

    qrAnimationId = requestAnimationFrame(tick);
  }

  function stopQrLoop(){
    if (qrAnimationId) {
      cancelAnimationFrame(qrAnimationId);
      qrAnimationId = null;
    }
  }

  function tryRunQrOnce(){
    if (!qrLibLoaded || !window.jsQR || !canvasEl || !canvasCtx) {
      ensureQrLib();
      return;
    }
    try {
      const imageData = canvasCtx.getImageData(0, 0, canvasEl.width, canvasEl.height);
      const code = window.jsQR(imageData.data, canvasEl.width, canvasEl.height);
      if (code && code.data) {
        if (infoLabelEl) {
          infoLabelEl.textContent = "QR 코드 인식: " + code.data;
        }
        if (typeof showBubble === "function") {
          try { showBubble("QR 코드를 읽었어요: " + code.data); } catch(e){}
        }

        var data = String(code.data || "");
        var isUrl = /^https?:\/\//i.test(data) || /^www\./i.test(data);
        if (isUrl) {
          if (!/^https?:\/\//i.test(data)) {
            data = "https://" + data.replace(/^www\./i, "www.");
          }
          try {
            window.location.href = data;
          } catch (e) {
            console.warn("QR redirect error:", e);
          }
        }
      } else if (infoLabelEl) {
        infoLabelEl.textContent = "이 화면에서는 QR 코드를 찾지 못했어요. 좀 더 가까이 또는 밝은 곳에서 다시 시도해 보세요.";
      }
    } catch (e) {
      console.warn("QR scan error:", e);
    }
  }

  window.openARCamera = function(){
    openOverlay();
    if (typeof resetSleepTimer === "function") {
      try { resetSleepTimer(); } catch(e){}
    }
  };
})();
