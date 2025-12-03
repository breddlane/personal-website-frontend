function generateUUID() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const uid = localStorage.getItem('uid') || generateUUID();
localStorage.setItem('uid', uid);

const ua = navigator.userAgent;
const userLang = navigator.language;

function detectOS() {
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Win/i.test(ua)) return 'Windows';
  if (/Mac/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return navigator.userAgentData?.platform || 'Unknown';
}

function detectBrowser() {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return /GX\//.test(ua) ? 'Opera GX' : 'Opera';
  if (/YaBrowser\//.test(ua)) return 'Yandex Browser';
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  if (/Firefox\//.test(ua)) return 'Firefox';
  return navigator.userAgentData?.brands?.[0]?.brand || 'Unknown';
}

function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches;
}

function isAppleMobileDevice() {
  return /iPhone|iPad|iPod/.test(ua);
}
if (isAppleMobileDevice()) document.body.style.touchAction = 'manipulation';

function isMobileDevice() {
  return (/Android|webOS|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua) || isAppleMobileDevice());
}

const fingerprintData = {
  os: detectOS(),
  cores: navigator.hardwareConcurrency || 0,
  memory: navigator.deviceMemory || 0,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown'
};

fetch('/track-user', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    uid,
    ...fingerprintData,

    language: userLang || 'Unknown',
    browser: detectBrowser(),
    deviceType: isMobileDevice() ? 'Mobile' : 'Desktop',
    resolution: `${window.screen.width}x${window.screen.height}`,
    referrer: document.referrer && document.referrer.length > 0 ? document.referrer.slice(0, 50) : 'Direct'
  })
});

const loadedFiles = {};
const loadedFileURLs = {};

const minLoadTime = 1000;
const startTime = Date.now();
const bgContainer = document.getElementById('bg-container');
const navbar = document.getElementById('navbar');
const chatButtonTooltip = document.getElementById('chat-button-tooltip');
const navLinks = document.getElementById('nav-links');
const sections = document.querySelectorAll('.section');
const firstSection = sections[0];

async function blobToDataURL(blob) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function isWebKit() {
  const ualc = ua.toLowerCase();
  return ualc.includes('applewebkit') && !ualc.includes('chrome') && !ualc.includes('crios') && !ualc.includes('fxios');
}

async function loadFile(src, maxAttempts = Infinity) {
  if (loadedFiles[src]) return loadedFiles[src];

  let attempts = 0;
  const fileName = src.split('/').pop();
  const ext = fileName.split('.').pop().toLowerCase();
  const mediaTypes = ['mp4', 'webm', 'ogg', 'jpg', 'jpeg', 'png', 'gif', 'webp'];

  while (attempts < maxAttempts) {
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(t(`Не удалось загрузить файл: ${fileName}`, `Failed to load file: ${fileName}`));

      const blob = await res.blob();
      loadedFiles[src] = blob;

      let url;
      if (mediaTypes.includes(ext) && isWebKit()) {
        url = await blobToDataURL(blob);
      } else {
        url = URL.createObjectURL(blob);
      }
      loadedFileURLs[src] = url;

      return blob;
    } catch (err) {
      attempts++;
      if (attempts >= maxAttempts) {
        showNotification(t(`Не удалось загрузить файл: ${fileName}`, `Failed to load file: ${fileName}`), 5000);
        throw err;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

function pathToSection(path) {
  const clean = path.replace(/\/+$/, '').toLowerCase();

  if (clean === '' || clean === '/') return { section: 'about' };
  if (clean === '/about') return { section: 'about' };
  if (clean === '/socials') return { section: 'socials' };

  if (clean.startsWith('/portfolio')) {
    const parts = clean.split('/');
    if (parts.length === 2) return { section: 'portfolio' };
    if (parts.length === 3) {
      const project = parts[2];
      const validProjects = Array.from(document.querySelectorAll('.projects-list a')).map(a => a.dataset.section);
      if (validProjects.includes(project)) {
        return { section: 'portfolio', project };
      } else {
        return { section: 'portfolio' };
      }
    }
    return { section: 'portfolio' };
  }

  if (clean.startsWith('/socials/')) return { section: 'socials' };

  return { section: 'about' };
}

function openSectionById(id, push, skipInitialCheck = false) {
  const newSection = document.getElementById(id);
  if (!newSection) return;

  if (newSection.classList.contains('active') || overlayOpening) {
    closeNavLinks();
    return;
  }

  const anyActive = Array.from(sections).some(section => section.classList.contains('active'));
  if (!anyActive && id === 'portfolio' && !skipInitialCheck) {
    closeNavLinks();
    closeOverlay();
    return;
  }

  closeNavLinks(true);

  document.querySelectorAll('#nav-links a').forEach(a =>
    a.classList.remove('active')
  );
  const link = document.querySelector(`.nav-link[data-section='${id}']`);
  if (link) link.classList.add('active');

  sections.forEach(section => {
    section.classList.remove('active');
    hideCustomScrollbar(section);
  });

  newSection.classList.add('active');
  onSectionChange(newSection);
  animateSectionElements(newSection);

  if (push && !(id === 'portfolio' && overlayIsActive)) history.pushState({ section: id }, '', id === 'about' ? '/about' : '/' + id);
}

function routeFromPath() {
  const { section, project } = pathToSection(window.location.pathname);

  let newPath = window.location.pathname;
  if (section === 'about' && newPath !== '/about') newPath = '/about';
  if (section === 'portfolio' && project && newPath !== `/portfolio/${project}`) newPath = `/portfolio/${project}`;
  if (section === 'portfolio' && !project && newPath !== '/portfolio') newPath = '/portfolio';
  if (section === 'socials' && newPath !== '/socials') newPath = '/socials';
  history.replaceState({ section }, '', newPath);

  openSectionById(section, false, true);

  if (section === 'portfolio' && project) {
    const projectLink = document.querySelector(`.projects-list a[data-section='${project}']`);
    if (projectLink) showOverlay(projectLink);
  }
}

(async function init() {
  await loadFile('/videos/background.mp4');

  const elapsed = Date.now() - startTime;
  const remaining = Math.max(minLoadTime - elapsed, 0);

  setTimeout(async () => {
    const videoData = loadedFileURLs['/videos/background.mp4'];
    if (videoData) {
      const video = document.createElement('video');
      video.src = videoData;
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';

      await new Promise(resolve => {
        video.addEventListener('loadeddata', () => resolve(), { once: true });
      });

      bgContainer.innerHTML = '';
      bgContainer.appendChild(video);
      video.play().catch(() => {});
    }

    navbar.classList.add('loaded');

    setTimeout(() => {
      routeFromPath();

      navbar.classList.add('fully-loaded');
      languageSpanWidths();
      chatButtonTooltip.classList.add('show-hint');
    }, 1000);

    setTimeout(() => {
      chatButtonTooltip.classList.remove('show-hint');
    }, 5000);

  }, remaining);
})();

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const id = link.dataset.section;
    openSectionById(id, true);
  });
});

const navToggle = document.getElementById('nav-toggle');
const navBlurOverlay = document.getElementById('nav-blur-overlay');

let onDocClick;

navToggle.addEventListener('click', () => {
  if (navbar.classList.contains('menu-open')) {
    closeNavLinks();
    if (onDocClick) {
      document.removeEventListener('click', onDocClick);
      onDocClick = null;
    }
  } else {
    navbar.classList.add('menu-open');
    navToggle.classList.add('menu-open');
    navBlurOverlay.style.height = 'calc(max(8vh, 60px) + 200px)';
    navBlurOverlay.style.opacity = '1';

    onDocClick = (e) => {
      if (!navbar.contains(e.target) && e.target !== navToggle) {
        closeNavLinks();
        document.removeEventListener('click', onDocClick);
        onDocClick = null;
      }
    };
    document.addEventListener('click', onDocClick);
  }
});

let navCloseTimeouts = [];

function closeNavLinks(navLinksAnim = false, instant = false) {
  if (!navbar.classList.contains('menu-open')) return;

  navCloseTimeouts.forEach(t => clearTimeout(t));
  navCloseTimeouts = [];

  if (instant) {
    navbar.classList.remove('menu-open');
    navToggle.classList.remove('menu-open');
    navLinks.style.pointerEvents = '';
    navLinks.style.height = '';
    navLinks.style.opacity = '';
    navBlurOverlay.style.height = '';
    navBlurOverlay.style.opacity = '';
  } else {
    const t1 = setTimeout(() => {
      navToggle.classList.remove('menu-open');
      navLinks.style.pointerEvents = 'none';
      navLinks.style.height = '0';
      navLinks.style.opacity = '0';
      navBlurOverlay.style.height = '';
    }, navLinksAnim ? 200 : 0);
    
    const t2 = setTimeout(() => {
      navbar.classList.remove('menu-open');
      navLinks.style.pointerEvents = '';
      navLinks.style.height = '';
      navLinks.style.opacity = '';
      navBlurOverlay.style.opacity = '';
    }, navLinksAnim ? 600 : 400);

    navCloseTimeouts.push(t1, t2);
  }
}

let notificationContainer = document.getElementById('notification-container');

if (!notificationContainer) {
  notificationContainer = document.createElement('div');
  notificationContainer.id = 'notification-container';
  document.body.appendChild(notificationContainer);
}

const maxVisible = 2;
const queue = [];
let activeNotifications = [];

function showNotification(message, duration) {
  const notif = document.createElement('div');
  notif.className = 'notification';
  notif.innerHTML = `
    <div class="message">${message}</div>
    <div class="progress"></div>
  `;
  queue.push({notif, duration});
  processQueue();
}

function processQueue() {
  if (activeNotifications.length >= maxVisible) return;
  if (queue.length === 0) return;

  const {notif, duration} = queue.shift();
  notificationContainer.appendChild(notif);
  activeNotifications.push(notif);

  requestAnimationFrame(() => notif.classList.add('show'));

  const progress = notif.querySelector('.progress');
  let start = Date.now();

  const tick = () => {
    const elapsed = Date.now() - start;
    const fraction = Math.min(elapsed / duration, 1);
    progress.style.transform = `scaleX(${1 - fraction})`;
    if (fraction < 1) requestAnimationFrame(tick);
  };
  tick();

  setTimeout(() => hideNotification(notif), duration);
}

function hideNotification(notif) {
  notif.classList.remove('show');

  setTimeout(() => {
    notif.remove();
    activeNotifications = activeNotifications.filter(n => n !== notif);
    processQueue();
  }, 400);
}

const chatButton = document.getElementById('chat-button');
const chatOverlay = document.getElementById('chat-overlay');
const chatWindow = document.getElementById('chat-window');
const chatHeader = document.getElementById('chat-header');
const chatClose = document.getElementById('chat-close');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const chatMessages = document.getElementById('chat-messages');

let firstChatOpen = false;
let tShowContent, tShowMessages;
let chatAnimating = false;
let chatClosing = false;

chatButton.addEventListener('click', () => {
  if (chatClosing) return;
  
  clearTimeout(tShowContent);
  clearTimeout(tShowMessages);

  chatAnimating = true;

  setTimeout(() => {
    if (navbar.classList.contains('fully-loaded')) {
      pauseVideo();
      chatButtonTooltip.classList.remove('show-hint');
      closeNavLinks();
      if (isMobileDevice()) {
        chatWindow.classList.add('mobile');
        chatOverlay.classList.add('mobile');
      } else {
        chatWindow.classList.remove('mobile');
        chatOverlay.classList.remove('mobile');
      }

      chatWindow.classList.add('open');
      chatOverlay.classList.add('active');
      history.pushState({ chat: true }, '');

      tShowContent = setTimeout(() => {
        chatWindow.classList.add('show-content');
      }, 300);

      tShowMessages = setTimeout(() => {
        chatMessages.style.transition = firstChatOpen ? 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)' : 'none';
        chatMessages.classList.add('show');
        if (!firstChatOpen) appendMessage('bot', t('Привет! Я ИИ-ассистент Мухаммеда. Чем могу помочь сегодня?', 'Hi there! I’m Muhammad’s AI assistant. How can I help you today?'));
        firstChatOpen = true;
        initChatScrollbar();
        isWaitingForResponse ? chatSend.classList.add('loading') : hideChatSendButton();
        chatInput.focus();

        chatAnimating = false;
      }, 700);
    }
  }, isTouchDevice() ? remainingHighlightDelay : 0);
});

function closeChat() {
  chatClosing = true;

  clearTimeout(tShowContent);
  clearTimeout(tShowMessages);

  chatInput.blur();

  chatWindow.classList.remove('open');
  chatOverlay.classList.remove('active');
  setTimeout(() => {
    chatWindow.classList.remove('show-content');
    chatMessages.classList.remove('show');
    chatSend.classList.add('hide');
    chatSend.classList.remove('loading')
    chatClosing = false;
  }, 700);
}

chatOverlay.addEventListener('click', closeChat);
chatClose.addEventListener('click', () => {
  setTimeout(closeChat, isTouchDevice() ? remainingHighlightDelay : 0);
});

const chatCloseIcon = document.getElementById('chat-close-icon');
const chatCloseLabel = document.getElementById('chat-close-label');

chatClose.addEventListener('mouseenter', () => {
  if (isTouchDevice()) return;
  const chatCloseWidth = chatCloseLabel.offsetWidth - chatCloseIcon.offsetWidth + 40;
  
  chatClose.style.width = chatCloseWidth + 'px';
  chatHeader.style.width = `calc(100% - ${chatCloseWidth + 36}px)`;

  chatCloseIcon.style.opacity = '0';
  chatCloseLabel.style.opacity = '1';
});

chatClose.addEventListener('mouseleave', () => {
  if (isTouchDevice()) return;
  chatClose.style.width = '40px';
  chatHeader.style.width = 'calc(100% - 76px)';
  chatCloseIcon.style.opacity = '1';
  chatCloseLabel.style.opacity = '0';
});

let scrollToBottom = false;

function scrollChatToBottom() {
  scrollToBottom = true;
  chatMessages.scrollTo({
    top: chatMessages.scrollHeight,
    behavior: 'smooth'
  });
  setTimeout(() => {
    scrollToBottom = false;
  }, 600);
}

function appendMessage(sender, text) {
  const msg = document.createElement('div');
  msg.className = sender === 'user' ? 'user-message' : 'bot-message';
  msg.textContent = text;
  chatMessages.appendChild(msg);
  scrollChatToBottom();

  if (sender === 'bot' && !chatWindow.classList.contains('open')) {
    showNotification(t('Новое сообщение от ИИ', 'New message from AI'), 5000);
  }
}

function showBotTyping() {
  const typing = document.createElement('div');
  typing.className = 'bot-typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  chatMessages.appendChild(typing);
  scrollChatToBottom();
  
  return typing;
}

function hideChatSendButton() {
  chatSend.classList.toggle('hide', chatInput.value.trim() === '');
}

chatInput.addEventListener('input', () => {
  if (chatAnimating) {
    e.preventDefault();
    return;
  }
  hideChatSendButton();
});

let chatHistory = [];
let isWaitingForResponse = false;

async function sendMessage() {
  if (!firstChatOpen || chatAnimating || isWaitingForResponse) return;
  const message = chatInput.value.trim();

  if (!message) return;

  /*
  if (message === 're') {
    appendMessage('user', 'Hi, bot.');
    appendMessage('bot', 'Hi, user.');
    return;
  }
  */

  appendMessage('user', message);
  chatInput.value = '';

  isWaitingForResponse = true;
  const typingIndicator = showBotTyping();
  chatSend.classList.add('loading');

  try {
    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid,
        fingerprintData,
        history: chatHistory, 
        currentMessage: message 
      })
    });

    const data = await res.json();

    if (res.ok && data.reply) {
      chatHistory.push({ role: 'user', content: message });
      chatHistory.push({ role: 'assistant', content: data.reply });
      appendMessage('bot', data.reply);
    } else if (data.error === 'SESSION_LOCKED') {
    } else {
      appendMessage('bot', t(`ОШИБКА: ${data.error || 'Нет ответа'}`, `ERROR: ${data.error || 'No reply'}`));
    }

  } catch (err) {
    appendMessage('bot', t('ОШИБКА: Не удалось подключиться к серверу', 'ERROR: Could not reach server'));
  } finally {
    isWaitingForResponse = false;
    typingIndicator.remove();
    chatSend.classList.remove('loading');
    hideChatSendButton();
  }
}

chatSend.addEventListener('click', () => {
  setTimeout(sendMessage, isTouchDevice() ? remainingHighlightDelay : 0);
});
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMessage();
});

function initChatScrollbar() {
  const thumb = document.getElementById('chat-scrollbar-thumb');

  let hideTimeout;

  function updateThumb() {
    const scrollHeight = chatMessages.scrollHeight;
    const clientHeight = chatMessages.clientHeight;

    if (scrollHeight <= clientHeight) {
      thumb.classList.remove('visible');
      thumb.style.display = 'none';
      return;
    }

    thumb.style.display = 'block';

    const paddingTop = parseFloat(window.getComputedStyle(chatMessages).paddingTop);
    const paddingBottom = parseFloat(window.getComputedStyle(chatMessages).paddingBottom);

    const trackHeight = clientHeight - paddingTop - paddingBottom;

    const thumbHeight = Math.max(Math.round((trackHeight / scrollHeight) * clientHeight), 24);

    const minTop = paddingTop;
    const maxTop = paddingTop + trackHeight - thumbHeight;

    const scrollRatio = chatMessages.scrollTop / (scrollHeight - clientHeight);
    const top = Math.round(minTop + scrollRatio * (maxTop - minTop));

    thumb.style.height = thumbHeight + 'px';
    thumb.style.top = top + 'px';
  }

  updateThumb();

  function showAndHide() {
    if (chatMessages.scrollHeight <= chatMessages.clientHeight || scrollToBottom) return;
    thumb.classList.add('visible');
    thumb.style.display = 'block';

    clearTimeout(hideTimeout);

    hideTimeout = setTimeout(() => {
      thumb.classList.remove('visible');
    }, 1000);
  }

  chatMessages.addEventListener('scroll', () => {
    updateThumb();
    showAndHide();
  });

  window.addEventListener('resize', () => {
    updateThumb();
    if (!isMobileDevice()) showAndHide();
  });

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.attributeName === 'class' && chatMessages.classList.contains('show')) {
        updateThumb();
        showAndHide();
      }
    });
  });

  observer.observe(chatMessages, { attributes: true });
}

window.addEventListener('orientationchange', () => chatInput.blur());

if (window.visualViewport && isMobileDevice()) {
  function adjustChatForKeyboard() {
    if (!chatWindow) return;

    const vh = window.visualViewport.height;
    const offsetTop = window.visualViewport.offsetTop;

    const isPortrait = window.matchMedia('(orientation: portrait)').matches;
    if (!isPortrait) {
      chatWindow.style.height = '';
      chatWindow.style.transform = '';
      return;
    }

    chatWindow.style.height = vh + 'px';
    chatWindow.style.transform = `translateY(${offsetTop}px)`;
  }

  window.visualViewport.addEventListener('resize', adjustChatForKeyboard);
  window.visualViewport.addEventListener('scroll', adjustChatForKeyboard);
  adjustChatForKeyboard();
}

sections.forEach(section => {
  const scrollbar = section.querySelector('.custom-scrollbar');
  const thumb = section.querySelector('.custom-thumb');

  const inner = section.querySelector('.section-inner')

  if (!inner || !scrollbar || !thumb) return;

  let scrollTarget = 0;
  let isDragging = false;
  let hideTimeout;

  scrollbar.style.opacity = '0';
  thumb.style.display = 'none';
  scrollbar.classList.remove('scrollable');

  function showScrollbar(long = false) {
    if (section.classList.contains('active')) {
      scrollbar.style.display = 'block';
      scrollbar.style.opacity = '1';

      clearTimeout(hideTimeout);

      hideTimeout = setTimeout(() => {
        if (!isDragging && !scrollbar.matches(':hover')) {
          scrollbar.style.opacity = '0';
        }
      }, long ? 2000 : 1000);
    }
  }

  let thumbTopCurrent = 0;

  function updateThumb() {
    if (section.classList.contains('active')) {
      const scrollHeight = inner.scrollHeight;
      const clientHeight = inner.clientHeight;

      if (scrollHeight <= clientHeight) {
        thumb.style.display = 'none';
        scrollbar.classList.remove('scrollable');
        scrollbar.style.display = 'none';
        return;
      }

      thumb.style.display = 'block';
      scrollbar.classList.add('scrollable');

      const scrollbarHeight = scrollbar.clientHeight;
      const thumbHeight = Math.max((clientHeight / scrollHeight) * scrollbarHeight, 30);
      thumb.style.height = thumbHeight + 'px';

      const currentScroll = isTouchDevice() ? inner.scrollTop : scrollTarget;

      const maxThumbTop = scrollbarHeight - thumbHeight;
      const thumbTopTarget = (currentScroll / (scrollHeight - clientHeight)) * maxThumbTop;

      if (isTouchDevice()) {
        thumbTopCurrent = thumbTopTarget;
      } else {
        thumbTopCurrent += (thumbTopTarget - thumbTopCurrent) * 0.2;
      }

      thumb.style.top = thumbTopCurrent + 'px';
    }
  }

  function animate() {
    if (isTouchDevice()) {
      updateThumb();
    } else {
      inner.scrollTop += (scrollTarget - inner.scrollTop) * 0.2;
      updateThumb();
    }

    requestAnimationFrame(animate);
  }
  animate();

  if (isTouchDevice()) {
    inner.addEventListener('scroll', () => {
      updateThumb();
      showScrollbar();
    });
  } else {
    function startDragging() {
      isDragging = true;
      scrollbar.classList.add('dragging');
      document.body.style.cursor = 'grabbing';
      showScrollbar();
    }
    function stopDragging() {
      isDragging = false;
      scrollbar.classList.remove('dragging');
      document.body.style.cursor = '';
      showScrollbar();
    }

    let thumbStartY = 0, thumbStartScroll = 0, isThumbDragging = false;

    thumb.addEventListener('mousedown', e => {
      if (e.button !== 0 || inner.scrollHeight <= inner.clientHeight) return;

      e.stopPropagation();
      startDragging();
      thumbStartY = e.clientY;
      thumbStartScroll = scrollTarget;
      document.body.style.userSelect = 'none';
      isThumbDragging = true;
    });

    document.addEventListener('mousemove', e => {
      if (!isThumbDragging) return;

      const deltaY = e.clientY - thumbStartY;
      const scrollableHeight = inner.scrollHeight - inner.clientHeight;
      const maxThumbTop = inner.clientHeight - thumb.offsetHeight;
      scrollTarget = Math.max(0, Math.min(thumbStartScroll + (deltaY / maxThumbTop) * scrollableHeight, scrollableHeight));
      showScrollbar();
    });

    document.addEventListener('mouseup', () => {
      if (!isThumbDragging) return;

      isThumbDragging = false;
      stopDragging();
    });
    document.addEventListener('selectstart', e => { if (isDragging) e.preventDefault(); });

    function dragFromScrollbar(e) {
      if (inner.scrollHeight <= inner.clientHeight || e.target === thumb) return;
      
      const rect = scrollbar.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const thumbHeight = thumb.offsetHeight;
      const maxThumbTop = scrollbar.clientHeight - thumbHeight;
      scrollTarget = Math.max(0, Math.min((clickY - thumbHeight / 2) / maxThumbTop * (inner.scrollHeight - inner.clientHeight), inner.scrollHeight - inner.clientHeight));
      startDragging();
      thumbStartY = e.clientY;
      thumbStartScroll = scrollTarget;
      isThumbDragging = true;
    }
    scrollbar.addEventListener('mousedown', e => { if (e.button === 0) dragFromScrollbar(e); });

    section.addEventListener('wheel', e => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || !section.classList.contains('active')) return;

      e.preventDefault();
      
      const maxScroll = inner.scrollHeight - inner.clientHeight;
      if (maxScroll <= 0) return;

      const oldScroll = scrollTarget;
      scrollTarget = Math.max(0, Math.min(scrollTarget + e.deltaY, maxScroll));

      if (scrollTarget !== oldScroll) {
        showScrollbar();
      }
    });

    scrollbar.addEventListener('mouseenter', () => showScrollbar());
    scrollbar.addEventListener('mouseleave', () => { if (!isDragging) scrollbar.style.opacity = '0'; });
  }

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.target.classList.contains('active')) {
        requestAnimationFrame(() => {
          updateThumb();
          showScrollbar(true);
        });
      }
    });
  });
  observer.observe(section, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener('resize', () => {
    if (!section.classList.contains('active')) return;

    if (inner.scrollHeight > inner.clientHeight) showScrollbar(true);
    updateThumb();
  });
});

const birthDate = new Date(2005, 7, 8);
const today = new Date();
let age = today.getFullYear() - birthDate.getFullYear();
const m = today.getMonth() - birthDate.getMonth();
if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
document.getElementById('age').textContent = age;

function languageSpanWidths() {
  const languageSpans = document.querySelectorAll('.language span');
  if (!languageSpans.length) return;

  languageSpans.forEach(span => span.style.width = 'auto');

  let maxSpanWidth = 0;
  languageSpans.forEach(span => {
    const spanWidth = span.offsetWidth;
    if (spanWidth > maxSpanWidth) maxSpanWidth = spanWidth;
  });

  languageSpans.forEach(span => {
    span.style.width = maxSpanWidth + 'px';
  });
}

function animateSectionElements(section) {
  animateTimeline(section);
  animateProgressBars(section);
  animateProjectList(section);
  animateLinkList(section);
}

let timelineDotsInterval = 0;
let timelineTimeouts = [];

function animateTimeline(section, animate = true) {
  const wrapper = section.querySelector('.side-block.education .content-wrapper');
  if (!wrapper) return;

  const dots = Array.from(wrapper.querySelectorAll('.timeline-dot'));
  const lines = Array.from(wrapper.querySelectorAll('.timeline-line'));
  if (dots.length < 2 || lines.length === 0) return;

  timelineTimeouts.forEach(clearTimeout);
  timelineTimeouts = [];
  timelineAnimationDone = false;
  timelineDotsInterval = 700 / dots.length;

  if (animate) {
    dots.forEach(dot => {
      dot.style.opacity = '0';
      dot.style.transition = 'none';
    });

    lines.forEach(line => {
      line.style.transform = 'scaleY(0)';
      line.style.transition = 'none';
    });

    dots.forEach((dot, i) => {
      const tDots = setTimeout(() => {
        dot.style.transition = `opacity ${timelineDotsInterval / 1000}s cubic-bezier(0.4, 0, 0.2, 1)`;
        dot.style.opacity = '1';
      }, i * timelineDotsInterval);
      timelineTimeouts.push(tDots);
    });
  }

  const tLines = setTimeout(() => {
    const wrapperRect = wrapper.getBoundingClientRect();

    lines.forEach((line, i) => {
      const topDot = dots[i];
      const bottomDot = dots[i + 1];
      if (!topDot || !bottomDot) {
        line.style.display = 'none';
        return;
      }
      line.style.display = 'block';

      const topRect = topDot.getBoundingClientRect();
      const bottomRect = bottomDot.getBoundingClientRect();

      const lineW = line.offsetWidth || 4;
      const centerX = topRect.left + topRect.width / 2;
      const left = centerX - wrapperRect.left - lineW / 2;

      const top = topRect.bottom - wrapperRect.top;
      const bottom = bottomRect.top - wrapperRect.top;
      const height = Math.max(0, bottom - top);

      line.style.left = left + 'px';
      line.style.top = top + 'px';
      line.style.height = height + 'px';

      if (!animate) return;
      line.style.transition = `transform ${timelineDotsInterval / 1000}s cubic-bezier(0.4, 0, 0.2, 1)`;
      line.style.transform = 'scaleY(1)';
    });

    timelineAnimationDone = true;
  }, animate ? dots.length * timelineDotsInterval : 0);

  timelineTimeouts.push(tLines);
}

const timelineResizeObserver = new ResizeObserver(entries => {
  entries.forEach(en => {
    const section = en.target.closest('.section');
    if (section.classList.contains('active') && section.id === 'about' && timelineAnimationDone) {
      animateTimeline(section, false);
    }
  });
});

document.querySelectorAll('.side-block.education .content-wrapper').forEach(w =>
  timelineResizeObserver.observe(w)
);

function animateProgressBars(section) {
  section.querySelectorAll('.progress-bar').forEach(bar => {
    const targetWidth = bar.dataset.width;
    if (!targetWidth) return;

    bar.style.transition = 'none';
    bar.style.width = '0';

    requestAnimationFrame(() => {
      bar.style.transition = `width ${(700 + timelineDotsInterval) / 1000}s cubic-bezier(0.4, 0, 0.2, 1)`;
      bar.style.width = targetWidth;
    });
  });
}

function getLinksInSection(section) {
  const lists = section.querySelectorAll('.projects-list');
  const out = [];
  lists.forEach(list => {
    out.push(...list.querySelectorAll('a'));
  });
  return out;
}

let projectsResetTimeout;

function animateProjectList(section) {
  const links = getLinksInSection(section);
  if (!links.length) return;

  const texts = links.map(l => Array.from(l.querySelectorAll('.project-text'))).flat();
  if (!texts.length) return;

  texts.forEach(t => {
    t.style.transition = 'none';
    t.style.width = '0px';
  });

  void document.body.offsetWidth;

  requestAnimationFrame(() => {
    texts.forEach(t => {
      const target = Math.ceil(t.scrollWidth) + 'px';
      t.style.transition = 'width 0.7s cubic-bezier(0.4, 0, 0.2, 1)';
      t.style.width = target;
    });
  });

  if (isTouchDevice()) {
    initTouchPortfolioIcons(section);
  } else {
    links.forEach(link => {
      if (link.dataset._projectHandlersAttached) return;
      link.dataset._projectHandlersAttached = '1';

      link.addEventListener('mouseenter', () => {
        clearTimeout(projectsResetTimeout);

        links.forEach(l => {
          const tArr = Array.from(l.querySelectorAll('.project-text'));
          tArr.forEach(tt => {
            tt.style.transition = 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
            tt.style.width = (l === link) ? Math.ceil(tt.scrollWidth) + 'px' : '0px';
          });
        });
      });

      link.addEventListener('mouseleave', () => {
        projectsResetTimeout = setTimeout(() => {
          links.forEach(l => {
            const tArr = Array.from(l.querySelectorAll('.project-text'));
            tArr.forEach(tt => {
              tt.style.width = Math.ceil(tt.scrollWidth) + 'px';
            });
          });
        }, 200);
      });
    });
  }
}

const observedLists = Array.from(document.querySelectorAll('.projects-list'));
if (observedLists.length) {
  const ro = new ResizeObserver(entries => {
    entries.forEach(en => {
      const ul = en.target;
      const section = ul.closest('.section');
      if (!section || !section.classList.contains('active')) return;

      const links = getLinksInSection(section);
      links.forEach(link => {
        const tArr = Array.from(link.querySelectorAll('.project-text'));
        tArr.forEach(t => {
          t.style.transition = 'none';
          t.style.width = Math.ceil(t.scrollWidth) + 'px';
        });
      });
    });
  });
  observedLists.forEach(ul => ro.observe(ul));
}

function updateProjectTextWidths() {
  const links = Array.from(document.querySelectorAll('.projects-list a'));
  links.forEach(link => {
    const texts = Array.from(link.querySelectorAll('.project-text'));
    texts.forEach(t => {
      t.style.transition = 'none';
      t.style.width = 'auto';
      const newWidth = Math.ceil(t.scrollWidth) + 'px';
      t.style.width = newWidth;
    });
  });
}

const portfolioIcons = {
  fullstack: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="currentColor">
      <path d="M29.4,84c4.82,8.34,12.49,14.66,21.6,17.8-3-5.55-5.25-11.55-7-17.8h-14.6Z"/>
      <path d="M41.5,64c0-3.4.3-6.7.7-10h-16.9c-.8,3.2-1.3,6.55-1.3,10s.5,6.8,1.3,10h16.9c-.4-3.3-.7-6.6-.7-10Z"/>
      <path d="M29.4,44h14.6c1.75-6.25,4-12.25,7-17.8-9.13,3.11-16.81,9.44-21.6,17.8Z"/>
      <path d="M98.6,44c-4.8-8.3-12.45-14.65-21.65-17.8,3.02,5.63,5.34,11.61,6.9,17.8h14.75Z"/>
      <path d="M64,24.15c-4.15,6-7.5,12.7-9.55,19.85h19.1c-2.05-7.15-5.4-13.85-9.55-19.85Z"/>
      <path d="M64,103.8c4.15-6,7.5-12.65,9.55-19.8h-19.1c2.05,7.15,5.4,13.8,9.55,19.8Z"/>
      <path d="M89.6,0h-51.2C17.19,0,0,17.19,0,38.4v51.2c0,21.21,17.19,38.4,38.4,38.4h51.2c21.21,0,38.4-17.19,38.4-38.4v-51.2C128,17.19,110.81,0,89.6,0ZM64,114c-27.61,0-50-22.39-50-50S36.35,14,64,14s50,22.39,50,50-22.39,50-50,50Z"/>
      <path d="M52.3,54c-.5,3.25-.8,6.6-.8,10s.3,6.7.8,10h23.4c.45-3.3.8-6.6.8-10s-.35-6.75-.8-10h-23.4Z"/>
      <path d="M86.5,64c0,3.4-.3,6.7-.7,10h16.9c.8-3.2,1.3-6.55,1.3-10s-.5-6.8-1.3-10h-16.9c.4,3.3.7,6.6.7,10Z"/>
      <path d="M76.95,101.8c9.12-3.14,16.81-9.46,21.65-17.8h-14.75c-1.6,6.25-3.9,12.25-6.9,17.8Z"/>
    </svg>
  `,
  'game-mod': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="currentColor">
      <path d="M87.67,52.95c2.19,0,3.96-1.77,3.96-3.96s-1.77-3.96-3.96-3.96-3.96,1.77-3.96,3.96,1.77,3.96,3.96,3.96Z"/>
      <path d="M79.76,52.95c-2.19,0-3.96,1.77-3.96,3.96s1.77,3.96,3.96,3.96,3.96-1.77,3.96-3.96-1.77-3.96-3.96-3.96Z"/>
      <path d="M47.1,52.95h-4.95v-4.95c0-1.64-1.33-2.97-2.97-2.97s-2.97,1.33-2.97,2.97v4.95h-4.95c-1.64,0-2.97,1.33-2.97,2.97s1.33,2.97,2.97,2.97h4.95v4.95c0,1.64,1.33,2.97,2.97,2.97s2.97-1.33,2.97-2.97v-4.95h4.95c1.64,0,2.97-1.33,2.97-2.97s-1.33-2.97-2.97-2.97Z"/>
      <path d="M89.6,0h-51.2C17.19,0,0,17.19,0,38.4v51.2c0,21.21,17.19,38.4,38.4,38.4h51.2c21.21,0,38.4-17.19,38.4-38.4v-51.2C128,17.19,110.81,0,89.6,0ZM110.66,95.47c-2.37,5.18-17.23,5.18-26.42-13.74h-40.65c-9.18,18.92-24.04,18.92-26.41,13.74-6.7-14.64-2.16-48.92,7.55-60.85,9.71-11.93,27.37,2.81,39.2,2.89,12.12-.09,28.79-15.69,39.2-2.89,10.41,12.79,14.25,46.21,7.55,60.85Z"/>
      <path d="M95.59,52.95c-2.19,0-3.96,1.77-3.96,3.96s1.77,3.96,3.96,3.96,3.96-1.77,3.96-3.96-1.77-3.96-3.96-3.96Z"/>
      <circle cx="87.67" cy="64.83" r="3.96"/>
    </svg>
  `,
  'vector-design': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="currentColor">
      <rect x="58.2" y="75.6" width="11.6" height="11.6"/>
      <path d="M30.77,85.52c-.13,0-.25,0-.38.02-1.18.1-2.27.66-3.04,1.57-1.59,1.88-1.36,4.7.53,6.29,1.88,1.59,4.7,1.36,6.29-.53.68-.8,1.05-1.82,1.05-2.87,0-2.47-1.99-4.47-4.46-4.47Z"/>
      <rect x="26.3" y="33.55" width="11.6" height="11.6"/>
      <path d="M89.6,0h-51.2C17.19,0,0,17.19,0,38.4v51.2c0,21.21,17.19,38.4,38.4,38.4h51.2c21.21,0,38.4-17.19,38.4-38.4v-51.2C128,17.19,110.81,0,89.6,0ZM107.5,50.95h-8.78c-.54,9.13-3.67,17.01-9.12,22.93-2.66,2.89-5.86,5.25-9.41,6.95l8.86,2.96c.11-.15.23-.29.35-.43,1.76-2.08,4.27-3.38,6.98-3.6,5.65-.47,10.61,3.72,11.09,9.37.47,5.65-3.72,10.61-9.37,11.09-.29.02-.59.04-.88.04-5.33-.01-9.76-4.1-10.21-9.41-.04-.54-.05-1.08,0-1.62l-11.4-3.8v7.58h-23.2v-7.58l-11.4,3.8c.42,5.62-3.76,10.52-9.38,10.99-.29.02-.58.04-.87.04-2.42,0-4.76-.86-6.61-2.42-4.33-3.66-4.87-10.14-1.21-14.47h0c3.66-4.33,10.14-4.87,14.46-1.21.58.49,1.1,1.04,1.56,1.65l8.86-2.95c-3.55-1.7-6.74-4.06-9.4-6.95-5.46-5.92-8.58-13.8-9.12-22.93h-8.79v-23.2h23.2v23.2h-8.6c.85,12.54,7.21,21.68,17.3,25.53v-6.68h23.2v6.68c10.09-3.85,16.46-12.99,17.3-25.53h-8.6v-23.2h23.2v23.2Z"/>
      <path d="M97.23,94.45c2.47,0,4.47-1.99,4.47-4.46,0-2.47-1.99-4.47-4.46-4.47-.13,0-.25,0-.38.02-1.18.1-2.27.66-3.04,1.57h0c-.68.8-1.05,1.82-1.05,2.88,0,2.47,1.99,4.47,4.46,4.47Z"/>
      <rect x="90.1" y="33.55" width="11.6" height="11.6"/>
    </svg>
  `,
  personal: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="currentColor">
      <path d="M89.6,0h-51.2C17.19,0,0,17.19,0,38.4v51.2c0,21.21,17.19,38.4,38.4,38.4h51.2c21.21,0,38.4-17.19,38.4-38.4v-51.2C128,17.19,110.81,0,89.6,0ZM64,18.29c12.62,0,22.86,10.23,22.86,22.86s-10.23,22.86-22.86,22.86-22.86-10.23-22.86-22.86,10.23-22.86,22.86-22.86ZM104,101.14c0,4.73-3.84,8.57-8.57,8.57h-62.86c-4.73,0-8.57-3.84-8.57-8.57v-7.43c0-13.25,10.75-24,24-24h2.98c3.98,1.82,8.38,2.86,13.02,2.86s9.05-1.04,13.02-2.86h2.98c13.25,0,24,10.75,24,24v7.43Z"/>
    </svg>
  `,
  community: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="currentColor">
      <path d="M89.6,0h-51.2C17.19,0,0,17.19,0,38.4v51.2c0,21.21,17.19,38.4,38.4,38.4h51.2c21.21,0,38.4-17.19,38.4-38.4v-51.2C128,17.19,110.81,0,89.6,0ZM99,39c5.52,0,10,4.48,10,10s-4.48,10-10,10-10-4.48-10-10,4.48-10,10-10ZM64,29c9.67,0,17.5,7.83,17.5,17.5s-7.83,17.5-17.5,17.5-17.5-7.83-17.5-17.5,7.83-17.5,17.5-17.5ZM29,39c5.52,0,10,4.48,10,10s-4.48,10-10,10-10-4.48-10-10,4.48-10,10-10ZM19,84c-2.77,0-5-2.23-5-5v-5c0-5.52,4.48-10,10-10h10c2.75,0,5.23,1.11,7.05,2.91-6.3,3.45-10.77,9.69-11.75,17.09h-10.3ZM94,91.5c0,4.14-3.36,7.5-7.5,7.5h-45c-4.14,0-7.5-3.36-7.5-7.5v-4.5c0-9.94,8.06-18,18-18h1.3c3.27,1.56,6.86,2.5,10.7,2.5s7.45-.94,10.7-2.5h1.3c9.94,0,18,8.06,18,18v4.5ZM114,79c0,2.77-2.23,5-5,5h-10.31c-.97-7.41-5.44-13.64-11.73-17.09,1.81-1.8,4.3-2.91,7.05-2.91h10c5.52,0,10,4.48,10,10v5Z"/>
    </svg>
  `
};

document.querySelectorAll('.projects-list a').forEach(link => {
  const icons = link.querySelectorAll('.icon');
  icons.forEach(icon => {
    const iconType = [...icon.classList].find(c => portfolioIcons[c]);
    if (iconType) icon.innerHTML = portfolioIcons[iconType];
  });
});

function updateProjectDescriptions() {
  document.querySelectorAll('.projects-list a .icon').forEach(icon => {
    if (icon.classList.contains('fullstack')) {
      icon.dataset.info = t(
        'FULLSTACK: Включает frontend и backend.',
        'FULLSTACK: Includes frontend and backend.'
      );
    } else if (icon.classList.contains('game-mod')) {
      icon.dataset.info = t(
        'ИГРОВАЯ МОДИФИКАЦИЯ: Добавляет новые функции или контент в существующую игру.',
        'GAME MODIFICATION: Adds new features or content to an existing game.'
      );
    } else if (icon.classList.contains('vector-design')) {
      icon.dataset.info = t(
        'ВЕКТОРНЫЙ ДИЗАЙН: Масштабируемая графика, созданная в векторных редакторах.',
        'VECTOR DESIGN: Scalable graphics made in vector editors.'
      );
    } else if (icon.classList.contains('personal')) {
      icon.dataset.info = t(
        'ЛИЧНЫЙ ПРОЕКТ: Создан для личных целей, обучения или отработки идей.',
        'PERSONAL PROJECT: Created for personal goals, learning, or exploring ideas.'
      );
    } else if (icon.classList.contains('community')) {
      icon.dataset.info = t(
        'ПРОЕКТ ДЛЯ СООБЩЕСТВА: Создан для поддержки или пользы сообщества.',
        'COMMUNITY PROJECT: Created to support or provide value to a community.'
      );
    }
  });
}

function initTouchPortfolioIcons(section) {
  const links = Array.from(section.querySelectorAll('a'));
  const icons = section.querySelectorAll('.icon');
  const hideTimeouts = new Map();

  function updateLines(activeLink = null, clickTransition = false) {
    links.forEach(l => {
      const tArr = Array.from(l.querySelectorAll('.project-text'));
      tArr.forEach(tt => {
        tt.style.transition = clickTransition ? `width ${remainingHighlightDelay / 1000}s cubic-bezier(0.4, 0, 0.2, 1)` : 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        tt.style.width = (activeLink && l === activeLink) ? Math.ceil(tt.scrollWidth) + 'px' : (activeLink ? '0px' : Math.ceil(tt.scrollWidth) + 'px');
      });
    });
  }

  function deactivateLink(link, icon) {
    link.classList.remove('touch-active');
    icon.classList.remove('touch-active');
    if (icon && hideTimeouts.has(icon)) {
      clearTimeout(hideTimeouts.get(icon));
      hideTimeouts.delete(icon);
    }
    updateLines();
  }

  function activateLink(link, icon) {
    links.forEach(l => l.classList.remove('touch-active'));
    icons.forEach(i => i.classList.remove('touch-active'));
    hideTimeouts.forEach(t => clearTimeout(t));
    hideTimeouts.clear();

    link.classList.add('touch-active');
    icon.classList.add('touch-active');
    closeNavLinks();
    updateLines(link);

    const timeout = setTimeout(() => {
      deactivateLink(link, icon);
    }, 3000);
    hideTimeouts.set(icon, timeout);
  }

  document.body.addEventListener('click', e => {
    icons.forEach(icon => {
      if (!icon.contains(e.target) && icon.classList.contains('touch-active')) {
        const link = icon.closest('a');
        deactivateLink(link, icon);
      }
    });
  });

  icons.forEach(icon => {
    if (icon.dataset.touchHandlerAttached) return;
    icon.dataset.touchHandlerAttached = '1';

    icon.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();

      const link = icon.closest('a');

      if (icon.classList.contains('touch-active')) {
        deactivateLink(link, icon);
        return;
      }

      activateLink(link, icon);
    });
  });

  links.forEach(link => {
    link.addEventListener('click', () => {
      updateLines(link, true);
    });
  });
}

let socialsTimeouts = [];
let socialsResetTimeout;

function animateLinkList(section) {
  let socialsCurrentHoveredLink = null;
  socialsTimeouts.forEach(clearTimeout);
  socialsTimeouts = [];
  clearTimeout(socialsResetTimeout);
  socialsAnimationDone = false;

  const links = Array.from(section.querySelectorAll('.socials-list a'));
  if (!links.length) return;

  const getLinkElements = (link) => {
    const logo = link.querySelector('.social-logo');
    const text = link.querySelector('span');
    return { logo, text };
  };

  const setInitialState = (link) => {
    const { logo, text } = getLinkElements(link);
    logo.style.opacity = '0';
    logo.style.transition = 'none';
    text.style.transition = 'none';
    logo.style.transform = 'scale(0)';
    text.style.transform = 'translateX(-24px)';
    void link.offsetHeight;
    logo.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
    text.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
  };

  links.forEach(setInitialState);

  links.forEach((link, index) => {
    const { logo, text } = getLinkElements(link);
    const timeout = setTimeout(() => {
      logo.style.opacity = '1';
      logo.style.transform = 'scale(1)';
      text.style.transform = 'translateX(20px)';
    }, index * 300 / (links.length - 1));
    socialsTimeouts.push(timeout);
  });

  const lastLogo = getLinkElements(links[links.length - 1]).logo;
  lastLogo.addEventListener('transitionend', function onEnd(e) {
    if (e.propertyName !== 'transform') return;
    socialsAnimationDone = true;
    lastLogo.removeEventListener('transitionend', onEnd);
    if (socialsCurrentHoveredLink) applyHover(socialsCurrentHoveredLink);
  });

  const applyHover = (activeLink) => {
    links.forEach(link => {
      const { logo, text } = getLinkElements(link);
      logo.style.transition = isTouchDevice() ? `transform ${remainingHighlightDelay / 1000}s cubic-bezier(0.4, 0, 0.2, 1), opacity ${remainingHighlightDelay / 1000}s cubic-bezier(0.4, 0, 0.2, 1)` : 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
      text.style.transition = isTouchDevice() ? `transform ${remainingHighlightDelay / 1000}s cubic-bezier(0.4, 0, 0.2, 1)` : 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
      if (link === activeLink) {
        logo.style.opacity = '1';
        logo.style.transform = 'scale(1)';
        text.style.transform = 'translateX(20px)';
      } else {
        logo.style.opacity = '0';
        logo.style.transform = 'scale(0)';
        text.style.transform = 'translateX(-24px)';
      }
    });
  };

  const resetHover = () => {
    clearTimeout(socialsResetTimeout);
    socialsResetTimeout = setTimeout(() => {
      links.forEach(link => {
        const { logo, text } = getLinkElements(link);
        logo.style.opacity = '1';
        logo.style.transform = 'scale(1)';
        text.style.transform = 'translateX(20px)';
      });
    }, isTouchDevice() ? 0 : 200);
  };

  links.forEach(link => {
    if (isTouchDevice()) {
      link.addEventListener('click', e => {
        e.preventDefault();

        socialsCurrentHoveredLink = link;
        clearTimeout(socialsResetTimeout);
        if (socialsAnimationDone) applyHover(link);
        setTimeout(() => {
          if (!link.classList.contains('copy-link')) window.open(link.href, '_blank', 'noopener, noreferrer');

          socialsCurrentHoveredLink = null;
          if (socialsAnimationDone) resetHover();
        }, remainingHighlightDelay);
      });
    } else {
      link.addEventListener('mouseenter', () => {
        socialsCurrentHoveredLink = link;
        clearTimeout(socialsResetTimeout);
        if (socialsAnimationDone) applyHover(link);
      });
      link.addEventListener('mouseleave', () => {
        socialsCurrentHoveredLink = null;
        if (socialsAnimationDone) resetHover();
      });
    }
  });

  return {
    clearAll: () => {
      socialsTimeouts.forEach(clearTimeout);
      socialsTimeouts = [];
      clearTimeout(socialsResetTimeout);
    }
  };
}

const copyLinks = document.querySelectorAll('.copy-link');

copyLinks.forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const content = link.dataset.content;
    const spanText = link.querySelector('span').innerHTML.trim();

    if (spanText === 'Discord') {
      message = t(`Discord ID скопирован: ${content}`, `Copied Discord ID: ${content}`);
    } else if (spanText === 'Email') {
      message = t(`Email скопирован: ${content}`, `Copied Email: ${content}`);
    }

    navigator.clipboard.writeText(content).then(() => {
      showNotification(message, 3000);
    });
  });
});

function portfolioSectionState(state) {
  const portfolioSection = document.getElementById('portfolio');
  state ? animateProjectList(portfolioSection) : hideCustomScrollbar(portfolioSection);
  portfolioSection.classList.toggle('active', state);
}

const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlay-inner');
const overlayBackButton = document.getElementById('overlay-back');

let projectOpened;

function updateOverlayTitle() {
  const title = document.getElementById('overlay-title');
  if (!projectOpened) return;

  const link = document.querySelector(`.projects-list a[data-section='${projectOpened}']`);
  const projectTextEls = Array.from(link.querySelectorAll('.project-text'));
  title.textContent = projectTextEls.length ? projectTextEls.map(el => el.innerText.trim()).filter(Boolean).join(' • ') : link.innerText.trim();
}

let overlayTimeouts = [];

function showOverlay(link) {
  portfolioSectionState(false);
  overlay.classList.add('active');

  projectOpened = link.dataset.section; 

  updateOverlayTitle();

  history.pushState({ section: 'portfolio', project: projectOpened }, '', `/portfolio/${projectOpened}`);

  document.querySelectorAll('#overlay-content .project-content').forEach(pc => {
    pc.style.display = 'none';
  });
  const projectContent = document.querySelector(`#overlay-content .project-content[data-project='${projectOpened}']`);
  if (projectContent) {
    projectContent.style.display = 'block';

    if (projectOpened === 'custom-interface') {
      createProjectImages('Custom Interface', 'custominterface', 'png', 21, 'images-custom-interface', 1920/1080, false);
      initYouTubePlayer();
    } else if (projectOpened === 'vehicletools') {
      createProjectImages('VehicleTools', 'vehicletools', 'png', 11, 'images-vehicletools', 1920/1080, false);
    } else if (projectOpened === 'personal-logo') {
      createProjectImages('Personal logo', 'personallogo', 'svg', 1, 'images-personal-logo', 2880/2400, true);
    }
  }

  if (overlayScroll) overlayScroll.resetScroll();

  overlayTimeouts.push(setTimeout(() => {
    overlayBackButton.style.opacity = '1';
  }, 300));
  overlayTimeouts.push(setTimeout(() => {
    overlayContent.style.opacity = '1';
    if (overlayScroll) overlayScroll.showScrollbar(true);
  }, 400));
}

function applyOverlayLayout() {
  const overlayBackButtonSpan = overlayBackButton.querySelector('span');

  const spanWidth = overlayBackButtonSpan.offsetWidth;
  const maxWidth = (spanWidth + 40) * 2 + 1000;

  if (window.innerWidth <= maxWidth) {
    overlayContent.style.top = '60px';
    overlayContent.style.padding = '0 0 160px 0';

    overlayBackButton.style.width = '100%';
    overlayBackButton.style.height = '60px';
    overlayBackButton.style.alignItems = 'center';
    overlayBackButton.style.padding = '0 0 0 20px';
  } else {
    overlayContent.style.top = '';
    overlayContent.style.padding = '';

    overlayBackButton.style.width = '';
    overlayBackButton.style.height = '';
    overlayBackButton.style.alignItems = '';
    overlayBackButton.style.padding = '';
  }
}

function closeOverlay() {
  overlayTimeouts.forEach(clearTimeout);
  overlayTimeouts = [];

  overlay.classList.remove('active');

  if (viewer.classList.contains('active')) closeViewer();

  overlayIsActive = false;

  hideCustomScrollbar(overlay);
  
  pauseVideo();
  iframe.blur();

  overlayContent.style.opacity = '0';
  overlayBackButton.style.opacity = '0';

  history.replaceState({ section: 'portfolio' }, '', '/portfolio');
  portfolioSectionState(true);
}

const viewer = document.getElementById('viewer-overlay');

const overlayScroll = initOverlayScrollbar();

function initOverlayScrollbar() {
  const scrollbar = overlay.querySelector('#overlay-custom-scrollbar');
  const thumb = overlay.querySelector('#overlay-custom-thumb');

  if (!overlayContent || !scrollbar || !thumb) return;

  let scrollTarget = 0;
  let isDragging = false;
  let hideTimeout;

  scrollbar.style.opacity = '0';
  thumb.style.display = 'none';
  scrollbar.classList.remove('scrollable');

  function showScrollbar(long = false) {
    if (isOverlayVisible() && !isViewerVisible() && !document.fullscreenElement) {
      scrollbar.style.display = 'block';
      scrollbar.style.opacity = '1';

      clearTimeout(hideTimeout);

      hideTimeout = setTimeout(() => {
        if (!isDragging && !scrollbar.matches(':hover')) {
          scrollbar.style.opacity = '0';
        }
      }, long ? 2000 : 1000);
    }
  }

  let thumbTopCurrent = 0;

  function updateThumb() {
    if (isOverlayVisible() && !isViewerVisible() && !document.fullscreenElement) {
      const scrollHeight = overlayContent.scrollHeight;
      const clientHeight = overlayContent.clientHeight;

      if (scrollHeight <= clientHeight) {
        thumb.style.display = 'none';
        scrollbar.classList.remove('scrollable');
        scrollbar.style.display = 'none';
        return;
      }

      thumb.style.display = 'block';
      scrollbar.classList.add('scrollable');

      const scrollbarHeight = scrollbar.clientHeight;
      const thumbHeight = Math.max((clientHeight / scrollHeight) * scrollbarHeight, 30);
      thumb.style.height = thumbHeight + 'px';

      const currentScroll = isTouchDevice() ? overlayContent.scrollTop : scrollTarget;

      const maxThumbTop = scrollbarHeight - thumbHeight;
      const thumbTopTarget = (currentScroll / (scrollHeight - clientHeight)) * maxThumbTop;

      if (isTouchDevice()) {
        thumbTopCurrent = thumbTopTarget;
      } else {
        thumbTopCurrent += (thumbTopTarget - thumbTopCurrent) * 0.2;
      }

      thumb.style.top = thumbTopCurrent + 'px';
    }
  }

  function animate() {
    if (isTouchDevice()) {
      updateThumb();
    } else {
      overlayContent.scrollTop += (scrollTarget - overlayContent.scrollTop) * 0.2;
      updateThumb();
    }

    requestAnimationFrame(animate);
  }
  animate();

  if (isTouchDevice()) {
    overlayContent.addEventListener('scroll', () => {
      updateThumb();
      showScrollbar();
    });
  } else {
    function startDragging() {
      isDragging = true;
      scrollbar.classList.add('dragging');
      document.body.style.cursor = 'grabbing';
      showScrollbar();
    }
    function stopDragging() {
      isDragging = false;
      scrollbar.classList.remove('dragging');
      document.body.style.cursor = '';
      showScrollbar();
    }

    let thumbStartY = 0, thumbStartScroll = 0, isThumbDragging = false;

    thumb.addEventListener('mousedown', e => {
      if (e.button !== 0 || overlayContent.scrollHeight <= overlayContent.clientHeight) return;

      e.stopPropagation();
      startDragging();
      thumbStartY = e.clientY;
      thumbStartScroll = scrollTarget;
      document.body.style.userSelect = 'none';
      isThumbDragging = true;
    });

    document.addEventListener('mousemove', e => {
      if (!isThumbDragging) return;

      const deltaY = e.clientY - thumbStartY;
      const scrollableHeight = overlayContent.scrollHeight - overlayContent.clientHeight;
      const maxThumbTop = overlayContent.clientHeight - thumb.offsetHeight;
      scrollTarget = Math.max(0, Math.min(thumbStartScroll + (deltaY / maxThumbTop) * scrollableHeight, scrollableHeight));
      showScrollbar();
    });

    document.addEventListener('mouseup', () => {
      if (!isThumbDragging) return;

      isThumbDragging = false;
      stopDragging();
    });
    document.addEventListener('selectstart', e => { if (isDragging) e.preventDefault(); });

    function dragFromScrollbar(e) {
      if (overlayContent.scrollHeight <= overlayContent.clientHeight || e.target === thumb) return;
      
      const rect = scrollbar.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const thumbHeight = thumb.offsetHeight;
      const maxThumbTop = scrollbar.clientHeight - thumbHeight;
      scrollTarget = Math.max(0, Math.min((clickY - thumbHeight / 2) / maxThumbTop * (overlayContent.scrollHeight - overlayContent.clientHeight), overlayContent.scrollHeight - overlayContent.clientHeight));
      startDragging();
      thumbStartY = e.clientY;
      thumbStartScroll = scrollTarget;
      isThumbDragging = true;
    }
    scrollbar.addEventListener('mousedown', e => { if (e.button === 0) dragFromScrollbar(e); });

    overlay.addEventListener('wheel', e => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || !isOverlayVisible() || isViewerVisible() || document.fullscreenElement) return;

      e.preventDefault();
      
      const maxScroll = overlayContent.scrollHeight - overlayContent.clientHeight;
      if (maxScroll <= 0) return;

      const oldScroll = scrollTarget;
      scrollTarget = Math.max(0, Math.min(scrollTarget + e.deltaY, maxScroll));

      if (scrollTarget !== oldScroll) {
        showScrollbar();
      }
    });

    scrollbar.addEventListener('mouseenter', () => showScrollbar());
    scrollbar.addEventListener('mouseleave', () => { if (!isDragging) scrollbar.style.opacity = '0'; });
  }

  window.addEventListener('resize', () => {
    if (!isOverlayVisible() || isViewerVisible() || document.fullscreenElement) return;

    if (overlayContent.scrollHeight > overlayContent.clientHeight) showScrollbar(true);
    updateThumb();
  });

  function resetScroll() {
    scrollTarget = 0;
    overlayContent.scrollTop = 0;
    thumb.style.top = '0px';
  }

  return { resetScroll, showScrollbar };
}

function hideCustomScrollbar(container) {
  const scrollbar = container.querySelector(container === overlay ? '#overlay-custom-scrollbar' : '.custom-scrollbar');
  const thumb = container.querySelector(container === overlay ? '#overlay-custom-thumb' : '.custom-thumb');

  scrollbar.style.opacity = '0';
  thumb.style.display = 'none';
  scrollbar.classList.remove('scrollable');
}

let overlayOpening = false;

document.querySelectorAll('.projects-list a').forEach(link => {
  link.addEventListener('click', e => {
    if (document.querySelector('.touch-active')) {
      e.preventDefault();
      return;
    }

    e.preventDefault();
    overlayOpening = true;

    setTimeout(() => {
      showOverlay(link);
      overlayOpening = false;
    }, isTouchDevice() ? remainingHighlightDelay : 0);
  });
});

overlayBackButton.addEventListener('click', () => {
  setTimeout(closeOverlay, isTouchDevice() ? remainingHighlightDelay : 0);
});

function isOverlayVisible() {
  return overlay.classList.contains('active') && window.getComputedStyle(overlay).opacity === '1';
}

function isViewerVisible() {
  return viewer.classList.contains('active') && window.getComputedStyle(overlay).opacity === '1';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (chatWindow.classList.contains('open')) {
      closeChat();
    } else {
      if (navbar.classList.contains('menu-open')) {
        closeNavLinks();
        return;
      }
      if (isViewerVisible()) {
        closeViewer();
      } else if (isOverlayVisible() && !document.fullscreenElement) {
        closeOverlay();
      }
    }
  }
});

window.addEventListener('popstate', () => {
  if (chatWindow.classList.contains('open')) {
    closeChat();
  } else {
    if (isViewerVisible()) {
      closeViewer();
    } else if (isOverlayVisible() && !document.fullscreenElement) {
      closeOverlay();
    }
  }
});

let overlayIsActive = false;

function onSectionChange(newSection) {
  overlayTimeouts.forEach(clearTimeout);
  overlayTimeouts = [];

  if (newSection.querySelector('#portfolio-wrapper') && overlayIsActive) {
    portfolioSectionState(false);
    overlay.classList.add('active');

    history.pushState({ section: 'portfolio', project: projectOpened }, '', `/portfolio/${projectOpened}`);

    overlayTimeouts.push(setTimeout(() => {
      overlayBackButton.style.opacity = '1';
    }, 300));
    overlayTimeouts.push(setTimeout(() => {
      overlayContent.style.opacity = '1';
      if (!viewer.classList.contains('active') && overlayScroll) overlayScroll.showScrollbar(true);
    }, 400));

    if (viewer.classList.contains('active')) {
      overlayTimeouts.push(setTimeout(() => {
        viewer.style.opacity = '';
        navbar.style.boxShadow = 'none';
        navBlurOverlay.style.boxShadow = 'none';
      }, 400));
    }
  } else {
    if (overlay.classList.contains('active')) {
      overlayIsActive = true;

      overlay.classList.remove('active');
      
      hideCustomScrollbar(overlay);
      
      pauseVideo();
      iframe.blur();

      overlayContent.style.opacity = '0';
      overlayBackButton.style.opacity = '0';

      if (viewer.classList.contains('active')) {
        viewer.style.opacity = '0';
        navbar.style.boxShadow = '';
        navBlurOverlay.style.boxShadow = '';
      }
    }
  }
}

const techIcons = {
  html: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
        <g fill="none">
            <rect width="256" height="256" fill="#E14E1D" rx="60"/>
            <path fill="white" d="m48 38l8.61 96.593h110.71l-3.715 41.43l-35.646 9.638l-35.579-9.624l-2.379-26.602H57.94l4.585 51.281l65.427 18.172l65.51-18.172l8.783-98.061H85.824l-2.923-32.71h122.238L208 38H48Z"/>
            <path fill="#EBEBEB" d="M128 38H48l8.61 96.593H128v-31.938H85.824l-2.923-32.71H128V38Zm0 147.647l-.041.014l-35.579-9.624l-2.379-26.602H57.94l4.585 51.281l65.427 18.172l.049-.014v-33.227Z"/>
        </g>
    </svg>
  `,
  css: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
        <g fill="none">
            <rect width="256" height="256" fill="#0277BD" rx="60"/>
            <path fill="#EBEBEB" d="m53.753 102.651l2.862 31.942h71.481v-31.942H53.753ZM128.095 38H48l2.904 31.942h77.191V38Zm0 180.841v-33.233l-.14.037l-35.574-9.605l-2.274-25.476H58.042l4.475 50.154l65.431 18.164l.147-.041Z"/>
            <path fill="white" d="m167.318 134.593l-3.708 41.426l-35.625 9.616v33.231l65.483-18.148l.48-5.397l7.506-84.092l.779-8.578L208 38h-80.015v31.942h45.009l-2.906 32.709h-42.103v31.942h39.333Z"/>
        </g>
    </svg>
  `,
  javascript: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
        <g fill="none">
            <rect width="256" height="256" fill="#F0DB4F" rx="60"/>
            <path fill="#323330" d="m67.312 213.932l19.59-11.856c3.78 6.701 7.218 12.371 15.465 12.371c7.905 0 12.889-3.092 12.889-15.12v-81.798h24.058v82.138c0 24.917-14.606 36.259-35.916 36.259c-19.245 0-30.416-9.967-36.087-21.996m85.07-2.576l19.588-11.341c5.157 8.421 11.859 14.607 23.715 14.607c9.969 0 16.325-4.984 16.325-11.858c0-8.248-6.53-11.17-17.528-15.98l-6.013-2.579c-17.357-7.388-28.871-16.668-28.871-36.258c0-18.044 13.748-31.792 35.229-31.792c15.294 0 26.292 5.328 34.196 19.247l-18.731 12.029c-4.125-7.389-8.591-10.31-15.465-10.31c-7.046 0-11.514 4.468-11.514 10.31c0 7.217 4.468 10.139 14.778 14.608l6.014 2.577c20.449 8.765 31.963 17.699 31.963 37.804c0 21.654-17.012 33.51-39.867 33.51c-22.339 0-36.774-10.654-43.819-24.574"/>
        </g>
    </svg>
  `,
  'node.js': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <path fill="#83CD29" d="M112.771 30.334L68.674 4.729c-2.781-1.584-6.402-1.584-9.205 0L14.901 30.334C12.031 31.985 10 35.088 10 38.407v51.142c0 3.319 2.084 6.423 4.954 8.083l11.775 6.688c5.628 2.772 7.617 2.772 10.178 2.772c8.333 0 13.093-5.039 13.093-13.828v-50.49c0-.713-.371-1.774-1.071-1.774h-5.623C42.594 41 41 42.061 41 42.773v50.49c0 3.896-3.524 7.773-10.11 4.48L18.723 90.73c-.424-.23-.723-.693-.723-1.181V38.407c0-.482.555-.966.982-1.213l44.424-25.561c.415-.235 1.025-.235 1.439 0l43.882 25.555c.42.253.272.722.272 1.219v51.142c0 .488.183.963-.232 1.198l-44.086 25.576c-.378.227-.847.227-1.261 0l-11.307-6.749c-.341-.198-.746-.269-1.073-.086c-3.146 1.783-3.726 2.02-6.677 3.043c-.726.253-1.797.692.41 1.929l14.798 8.754a9.294 9.294 0 0 0 4.647 1.246c1.642 0 3.25-.426 4.667-1.246l43.885-25.582c2.87-1.672 4.23-4.764 4.23-8.083V38.407c0-3.319-1.36-6.414-4.229-8.073zM77.91 81.445c-11.726 0-14.309-3.235-15.17-9.066c-.1-.628-.633-1.379-1.272-1.379h-5.731c-.709 0-1.279.86-1.279 1.566c0 7.466 4.059 16.512 23.453 16.512c14.039 0 22.088-5.455 22.088-15.109c0-9.572-6.467-12.084-20.082-13.886c-13.762-1.819-15.16-2.738-15.16-5.962c0-2.658 1.184-6.203 11.374-6.203c9.105 0 12.461 1.954 13.842 8.091c.118.577.645.991 1.24.991h5.754c.354 0 .692-.143.94-.396c.24-.272.367-.613.335-.979c-.891-10.568-7.912-15.493-22.112-15.493c-12.631 0-20.166 5.334-20.166 14.275c0 9.698 7.497 12.378 19.622 13.577c14.505 1.422 15.633 3.542 15.633 6.395c0 4.955-3.978 7.066-13.309 7.066z"/>
    </svg>
  `,
  sqlite: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="deviconSqlite0" x1="-15.615" x2="-6.741" y1="-9.108" y2="-9.108" gradientTransform="rotate(90 -90.486 64.634) scale(9.2712)" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#95d7f4"/>
          <stop offset=".92" stop-color="#0f7fcc"/>
          <stop offset="1" stop-color="#0f7fcc"/>
        </linearGradient>
      </defs>
      <path fill="#0b7fcc" d="M69.5 99.176c-.059-.73-.094-1.2-.094-1.2S67.2 83.087 64.57 78.642c-.414-.707.043-3.594 1.207-7.88c.68 1.169 3.54 6.192 4.118 7.81c.648 1.824.78 2.347.78 2.347s-1.57-8.082-4.144-12.797a162.286 162.286 0 0 1 2.004-6.265c.973 1.71 3.313 5.859 3.828 7.3c.102.293.192.543.27.774c.023-.137.05-.274.074-.414c-.59-2.504-1.75-6.86-3.336-10.082c3.52-18.328 15.531-42.824 27.84-53.754H16.9c-5.387 0-9.789 4.406-9.789 9.789v88.57c0 5.383 4.406 9.789 9.79 9.789h52.897a118.657 118.657 0 0 1-.297-14.652"/>
      <path fill="url(#deviconSqlite0)" d="M65.777 70.762c.68 1.168 3.54 6.188 4.117 7.809c.649 1.824.781 2.347.781 2.347s-1.57-8.082-4.144-12.797a164.535 164.535 0 0 1 2.004-6.27c.887 1.567 2.922 5.169 3.652 6.872l.082-.961c-.648-2.496-1.633-5.766-2.898-8.328c3.242-16.871 13.68-38.97 24.926-50.898H16.899a6.94 6.94 0 0 0-6.934 6.933v82.11c17.527-6.731 38.664-12.88 56.855-12.614c-.672-2.605-1.441-4.96-2.25-6.324c-.414-.707.043-3.597 1.207-7.879"/>
      <path fill="#003956" d="M115.95 2.781c-5.5-4.906-12.164-2.933-18.734 2.899a44.347 44.347 0 0 0-2.914 2.859c-11.25 11.926-21.684 34.023-24.926 50.895c1.262 2.563 2.25 5.832 2.894 8.328c.168.64.32 1.242.442 1.754c.285 1.207.437 1.996.437 1.996s-.101-.383-.515-1.582c-.078-.23-.168-.484-.27-.773a7.683 7.683 0 0 0-.172-.434c-.734-1.703-2.765-5.305-3.656-6.867c-.762 2.25-1.437 4.36-2.004 6.265c2.578 4.715 4.149 12.797 4.149 12.797s-.137-.523-.782-2.347c-.578-1.621-3.441-6.64-4.117-7.809c-1.164 4.281-1.625 7.172-1.207 7.88c.809 1.362 1.574 3.722 2.25 6.323c1.524 5.867 2.586 13.012 2.586 13.012s.031.469.094 1.2a118.653 118.653 0 0 0 .297 14.651c.504 6.11 1.453 11.363 2.664 14.172l.828-.449c-1.781-5.535-2.504-12.793-2.188-21.156c.48-12.793 3.422-28.215 8.856-44.289c9.191-24.27 21.938-43.738 33.602-53.035c-10.633 9.602-25.023 40.684-29.332 52.195c-4.82 12.891-8.238 24.984-10.301 36.574c3.55-10.863 15.047-15.53 15.047-15.53s5.637-6.958 12.227-16.888c-3.95.903-10.43 2.442-12.598 3.352c-3.2 1.344-4.067 1.8-4.067 1.8s10.371-6.312 19.27-9.171c12.234-19.27 25.562-46.648 12.141-58.621"/>
    </svg>
  `,
  lua: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
        <path fill="#00007D" d="M225.85 128.024c0-54.024-43.846-97.87-97.87-97.87c-54.023 0-97.869 43.846-97.869 97.87c0 54.023 43.846 97.869 97.87 97.869c54.023 0 97.869-43.846 97.869-97.87"/>
        <path fill="white" d="M197.195 87.475c0-15.823-12.842-28.666-28.665-28.666c-15.823 0-28.666 12.843-28.666 28.666s12.843 28.665 28.666 28.665s28.665-12.842 28.665-28.665"/>
        <path fill="#00007D" d="M254.515 30.154c0-15.823-12.842-28.665-28.665-28.665c-15.823 0-28.665 12.842-28.665 28.665c0 15.824 12.842 28.666 28.665 28.666c15.823 0 28.665-12.842 28.665-28.666"/>
        <path fill="white" d="M61.25 113.756h8.559v55.654h31.697v7.526H61.25v-63.18m55.696 17.118v30.579c0 2.351.363 4.273 1.09 5.763c1.34 2.753 3.839 4.13 7.497 4.13c5.25 0 8.824-2.41 10.723-7.226c1.033-2.581 1.55-6.122 1.55-10.624v-22.622h7.74v46.062h-7.31l.086-6.795c-.986 1.749-2.21 3.225-3.674 4.43c-2.897 2.408-6.414 3.613-10.55 3.613c-6.443 0-10.832-2.194-13.166-6.581c-1.266-2.35-1.9-5.49-1.9-9.419v-31.31h7.914m65.934 18.186c1.777-.229 2.967-.973 3.57-2.233c.342-.69.515-1.683.515-2.979c0-2.647-.938-4.569-2.812-5.763c-1.875-1.195-4.557-1.792-8.047-1.792c-4.035 0-6.897 1.095-8.585 3.285c-.945 1.21-1.56 3.012-1.846 5.403h-7.225c.143-5.694 1.983-9.654 5.52-11.883c3.536-2.228 7.639-3.342 12.307-3.342c5.412 0 9.809 1.032 13.188 3.096c3.35 2.065 5.026 5.276 5.026 9.635v26.538c0 .802.165 1.448.495 1.934c.329.487 1.025.73 2.086.73c.344 0 .73-.021 1.16-.064a18.5 18.5 0 0 0 1.377-.193v5.72c-1.204.343-2.122.558-2.752.644c-.631.086-1.492.13-2.58.13c-2.667 0-4.603-.947-5.807-2.839c-.631-1.003-1.075-2.422-1.333-4.257c-1.578 2.065-3.843 3.856-6.796 5.376c-2.953 1.518-6.208 2.278-9.763 2.278c-4.273 0-7.763-1.296-10.472-3.887c-2.71-2.591-4.065-5.835-4.065-9.73c0-4.266 1.334-7.574 4-9.922c2.667-2.348 6.164-3.795 10.494-4.34l12.344-1.545Zm-16.302 20.913c1.635 1.288 3.57 1.931 5.807 1.931c2.723 0 5.36-.63 7.913-1.889c4.301-2.09 6.451-5.51 6.451-10.263v-6.226c-.944.604-2.16 1.107-3.648 1.51s-2.947.69-4.378.861l-4.679.602c-2.804.372-4.913.959-6.326 1.76c-2.394 1.344-3.59 3.49-3.59 6.436c0 2.232.816 3.99 2.45 5.278Z"/>
        <path fill="#929292" d="m132.532 255.926l-.102-2.935c3.628-.127 7.287-.413 10.873-.85l.356 2.914c-3.67.448-7.414.74-11.127.87Zm-11.162-.09c-3.707-.19-7.445-.545-11.111-1.054l.403-2.908c3.582.497 7.236.843 10.858 1.029l-.15 2.932Zm33.3-2.618l-.61-2.872c3.545-.752 7.097-1.67 10.559-2.73l.86 2.807a127.516 127.516 0 0 1-10.81 2.795Zm-55.39-.454a127.778 127.778 0 0 1-10.761-2.973l.905-2.793a124.63 124.63 0 0 0 10.512 2.904l-.656 2.862ZM176 246.69l-1.103-2.721a124.907 124.907 0 0 0 9.916-4.533l1.336 2.615A127.927 127.927 0 0 1 176 246.69Zm-97.945-.809a128.098 128.098 0 0 1-10.079-4.811l1.38-2.592c3.2 1.704 6.514 3.285 9.847 4.7l-1.148 2.703Zm117.802-9.34l-1.56-2.488a126.271 126.271 0 0 0 8.982-6.19l1.77 2.343a129.217 129.217 0 0 1-9.192 6.334Zm-137.5-1.144a129.107 129.107 0 0 1-9.088-6.487l1.808-2.314a126.013 126.013 0 0 0 8.88 6.34l-1.6 2.461Zm155.3-12.299l-1.966-2.18c2.692-2.427 5.31-5 7.78-7.649l2.147 2.003a129.597 129.597 0 0 1-7.962 7.826Zm-172.88-1.438a129.433 129.433 0 0 1-7.83-7.958l2.18-1.966a126.537 126.537 0 0 0 7.652 7.776l-2.002 2.148Zm188.094-14.876l-2.313-1.808a126.198 126.198 0 0 0 6.343-8.878l2.461 1.602a128.97 128.97 0 0 1-6.491 9.084Zm-203.037-1.686a128.8 128.8 0 0 1-6.338-9.189l2.487-1.56a125.953 125.953 0 0 0 6.194 8.978l-2.343 1.77Zm215.206-17.015l-2.591-1.38c1.705-3.2 3.288-6.513 4.705-9.845l2.702 1.149a128.242 128.242 0 0 1-4.816 10.076Zm-227.058-1.878a128.078 128.078 0 0 1-4.645-10.148l2.72-1.104a124.897 124.897 0 0 0 4.538 9.914l-2.613 1.338Zm235.788-18.66l-2.792-.907a124.597 124.597 0 0 0 2.91-10.51l2.861.658a127.587 127.587 0 0 1-2.979 10.759ZM5.6 165.537a127.414 127.414 0 0 1-2.8-10.807l2.872-.61a124.605 124.605 0 0 0 2.735 10.557l-2.807.86Zm249.175-19.73l-2.908-.405c.499-3.58.847-7.233 1.033-10.857l2.933.152a129.044 129.044 0 0 1-1.058 11.11ZM.957 143.721a129.35 129.35 0 0 1-.876-11.127l2.935-.104c.127 3.627.416 7.285.855 10.873l-2.914.358Zm252.035-20.085c-.126-3.62-.414-7.28-.856-10.876l2.914-.358c.452 3.681.747 7.427.876 11.132l-2.934.102ZM3.098 121.581l-2.932-.148c.188-3.708.54-7.447 1.047-11.112l2.909.402c-.496 3.582-.84 7.235-1.024 10.858ZM250.335 102a125.611 125.611 0 0 0-2.732-10.563l2.808-.858a128.514 128.514 0 0 1 2.796 10.81l-2.872.611ZM6.088 99.996l-2.862-.656a127.484 127.484 0 0 1 2.968-10.762l2.794.905a124.54 124.54 0 0 0-2.9 10.513Zm237.874-18.845a125.67 125.67 0 0 0-4.525-9.928l2.616-1.333a128.638 128.638 0 0 1 4.631 10.161l-2.722 1.1ZM12.802 79.26l-2.703-1.146a127.956 127.956 0 0 1 4.806-10.082l2.592 1.379a125.062 125.062 0 0 0-4.695 9.849Zm10.233-19.25l-2.462-1.6a129.05 129.05 0 0 1 6.483-9.091l2.314 1.807a126.246 126.246 0 0 0-6.335 8.883Zm13.416-17.185l-2.15-2a129.429 129.429 0 0 1 7.954-7.835l1.968 2.18a126.539 126.539 0 0 0-7.772 7.655Zm16.177-14.61l-1.772-2.34a128.99 128.99 0 0 1 9.186-6.343l1.562 2.486a125.92 125.92 0 0 0-8.976 6.198Zm143.494-5.099l-.16-.103l1.596-2.464l.155.1l-1.591 2.467Zm-9.568-5.627a125.707 125.707 0 0 0-9.854-4.682l1.143-2.704a128.379 128.379 0 0 1 10.085 4.792l-1.374 2.594Zm-115.471-.864l-1.34-2.613a127.854 127.854 0 0 1 10.146-4.65l1.105 2.72a125.005 125.005 0 0 0-9.911 4.543Zm95.392-7.623a125.475 125.475 0 0 0-10.517-2.9l.656-2.862c3.614.828 7.236 1.827 10.765 2.968l-.904 2.794ZM91.27 8.424l-.862-2.807a127.612 127.612 0 0 1 10.806-2.805l.612 2.871A124.668 124.668 0 0 0 91.27 8.424Zm53.958-4.296c-3.59-.5-7.244-.846-10.862-1.03l.15-2.932c3.702.188 7.443.543 11.117 1.054l-.405 2.908Zm-32.646-.249l-.36-2.914c3.67-.452 7.414-.748 11.127-.881l.105 2.934c-3.629.13-7.286.42-10.872.861Z"/>
    </svg>
  `,
  'adobe illustrator': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
        <g fill="none">
            <rect width="256" height="256" fill="#300" rx="60"/>
            <path fill="#FF9A00" d="M123.733 152.333h-39.68L75.946 177.4c-.213.96-1.066 1.6-2.026 1.493H53.866c-1.173 0-1.493-.64-1.173-1.92l34.347-98.88c.32-1.066.64-2.24 1.066-3.52c.427-2.24.64-4.586.64-6.933c-.106-.533.32-1.067.854-1.173h27.626c.854 0 1.28.32 1.387.853l38.933 109.867c.32 1.173 0 1.706-1.066 1.706h-22.294c-.746.107-1.493-.426-1.706-1.173l-8.747-25.387ZM90.24 130.68h27.093c-.64-2.24-1.493-4.907-2.453-7.68c-.96-2.88-1.92-5.973-2.88-9.173c-1.067-3.307-2.027-6.507-3.094-9.814c-1.066-3.306-2.026-6.4-2.88-9.493c-.853-2.986-1.6-5.76-2.346-8.32h-.214c-.96 4.587-2.133 9.174-3.626 13.76c-1.6 5.12-3.2 10.453-4.907 15.787a209.317 209.317 0 0 1-4.693 14.933Zm91.093-45.547c-3.52.107-6.933-1.28-9.493-3.733c-2.453-2.667-3.733-6.187-3.627-9.813c-.106-3.627 1.28-7.04 3.84-9.494c2.56-2.453 5.974-3.733 9.494-3.733c4.16 0 7.36 1.28 9.706 3.733a13.464 13.464 0 0 1 3.52 9.494c.107 3.626-1.173 7.146-3.733 9.813c-2.453 2.56-6.08 3.947-9.707 3.733Zm-11.946 92.587V95.587c0-1.067.426-1.494 1.386-1.494h21.12c.96 0 1.387.534 1.387 1.494v82.133c0 1.173-.427 1.707-1.387 1.707h-20.906c-1.067 0-1.6-.64-1.6-1.707Z"/>
        </g>
    </svg>
  `
};

document.querySelectorAll('.tech-badge').forEach(badge => {
  const nameEl = badge.querySelector('.tech-name');
  const iconEl = badge.querySelector('.tech-icon');
  const techName = nameEl.textContent.trim().toLowerCase();
  if (techIcons[techName]) iconEl.innerHTML = techIcons[techName];
});

const overlayIcons = {
  save: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5l5 5l5-5m-5 5V3"/>
    </svg>
  `,
  code: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 16" fill="currentColor">
        <path d="M12.736.064c.52.2.787.805.598 1.353L8.546 15.305c-.19.548-.763.83-1.282.631c-.52-.2-.787-.805-.598-1.353L11.454.695c.19-.548.763-.83 1.282-.631ZM2.414 8.256L5.95 11.99c.39.412.39 1.08 0 1.492a.963.963 0 0 1-1.414 0L.293 9.003a1.098 1.098 0 0 1 0-1.493l4.243-4.48a.963.963 0 0 1 1.414 0a1.1 1.1 0 0 1 0 1.494L2.414 8.256Zm15.172 0L14.05 4.524a1.098 1.098 0 0 1 0-1.493a.963.963 0 0 1 1.414 0l4.243 4.479c.39.412.39 1.08 0 1.493l-4.243 4.478a.963.963 0 0 1-1.414 0a1.098 1.098 0 0 1 0-1.492l3.536-3.733Z"/>
    </svg>
  `,
  copy: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <g fill="none" fill-rule="evenodd">
            <path d="M24 0v24H0V0h24ZM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035c-.01-.004-.019-.001-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427c-.002-.01-.009-.017-.017-.018Zm.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093c.012.004.023 0 .029-.008l.004-.014l-.034-.614c-.003-.012-.01-.02-.02-.022Zm-.715.002a.023.023 0 0 0-.027.006l-.006.014l-.034.614c0 .012.007.02.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01l-.184-.092Z"/>
            <path fill="currentColor" d="M9 2a2 2 0 0 0-2 2v2h2V4h11v11h-2v2h2a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H9ZM4 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H4Z"/>
        </g>
    </svg>
  `
};

const overlayButtons = document.querySelectorAll('.overlay-button');

overlayButtons.forEach(button => {
  const type = [...button.classList].find(c => overlayIcons[c]);
  if (overlayIcons[type]) button.innerHTML = overlayIcons[type];

  if (button.classList.contains('save')) {
    button.dataset.originalHref = button.getAttribute('href');
    const tooltip = button.parentElement.querySelector('.tooltip');

    button.addEventListener('mouseenter', () => {
      const originalHref = button.dataset.originalHref;
      tooltip.textContent = loadedFiles[originalHref] ? t('Сохранить файл', 'Save File') : t('Загрузить файл', 'Download File');
      if (!isTouchDevice() && loadedFiles[originalHref] && button.getAttribute('href') !== loadedFileURLs[originalHref]) button.setAttribute('href', loadedFileURLs[originalHref]);
    });

    button.addEventListener('click', () => {
      const originalHref = button.dataset.originalHref;
      const fileName = originalHref.split('/').pop();

      if (loadedFiles[originalHref]) {
        if (!isTouchDevice() && button.getAttribute('href') !== loadedFileURLs[originalHref]) button.setAttribute('href', loadedFileURLs[originalHref]);
        button.setAttribute('download', fileName);
        showNotification(t(`Сохранено: ${fileName}`, `Saved: ${fileName}`), 3000);
      } else {
        showNotification(t(`Загружается: ${fileName}`, `Downloading: ${fileName}`), 3000);
      }
    });
  } else if (button.classList.contains('code')) {
    button.addEventListener('click', () => {
      setTimeout(() => {
        showViewer('code', button.dataset.file, button.dataset.language, button.dataset.encoding);
      }, isTouchDevice() ? remainingHighlightDelay : 0);
    });
  }
});

function getProjectCaptions() {
  const captionsMap = {
    'custom-interface': [
      t('НАСТРОЙКИ: Главная страница', 'SETTINGS: Home Page'),
      t('НАСТРОЙКИ: Информация', 'SETTINGS: Information'),
      t('НАСТРОЙКИ: Информация >> Изменения', 'SETTINGS: Information >> Changelog'),
      t('НАСТРОЙКИ: Дополнительные настройки', 'SETTINGS: Additional Settings'),
      t('НАСТРОЙКИ: Интерфейс >> Радар', 'SETTINGS: Interface >> Radar'),
      t('НАСТРОЙКИ: Интерфейс >> Прицел', 'SETTINGS: Interface >> Crosshair'),
      t('НАСТРОЙКИ: Виджеты >> Дата и время', 'SETTINGS: Widgets >> Date and Time'),
      t('НАСТРОЙКИ: Виджеты >> Кадры в секунду', 'SETTINGS: Widgets >> Frames per Second'),
      t('НАСТРОЙКИ: Уведомление', 'SETTINGS: Notification'),
      'HUD',
      'HUD',
      'HUD',
      t('Радар', 'Radar'),
      t('Прицел', 'Crosshair'),
      t('Спидометр', 'Speedometer'),
      t('Таблица онлайна', 'Scoreboard'),
      t('Таблица онлайна', 'Scoreboard'),
      t('Таблица онлайна', 'Scoreboard'),
      t('Информационное окно', 'Information Window'),
      t('Дата и время', 'Date and Time'),
      t('Кадры в секунду', 'Frames per Second')
    ],
    'vehicletools': [
      t('НАСТРОЙКИ: Основные', 'SETTINGS: Main'),
      t('НАСТРОЙКИ: Основные', 'SETTINGS: Main'),
      t('НАСТРОЙКИ: Основные', 'SETTINGS: Main'),
      t('НАСТРОЙКИ: Основные', 'SETTINGS: Main'),
      t('НАСТРОЙКИ: Читы', 'SETTINGS: Cheats'),
      t('НАСТРОЙКИ: Информация', 'SETTINGS: Information'),
      t('НАСТРОЙКИ: Окно подтверждения', 'SETTINGS: Confirmation Window'),
      t('НАСТРОЙКИ: Окно с ID цветов транспортных средств', 'SETTINGS: Vehicle Color IDs Window'),
      t('НАСТРОЙКИ: Уведомление', 'SETTINGS: Notification'),
      t('Визуальные модификации', 'Visual Modifications'),
      t('Визуальные модификации', 'Visual Modifications')
    ]
  };

  viewerState.captions = captionsMap[projectOpened] || [];
  updateViewer(true, false);
}

function createProjectImages(projectName, fileName, fileExtention, count, imagesId, aspectRatio, objectFit) {
  const projectImages = document.getElementById(imagesId);
  projectImages.innerHTML = '';
  projectImages.scrollLeft = 0;

  const container = projectImages.closest('.project-images');
  const leftArrow = container.querySelector('.images-arrow.left');
  const rightArrow = container.querySelector('.images-arrow.right');

  const loaders = [];
  let loadedCount = 0;

  for (let i = 0; i < count; i++) {
    const item = document.createElement('div');
    item.className = 'image-item';

    enableTouchHighlight(item);

    const loader = document.createElement('div');
    loader.className = 'media-loader';
    item.appendChild(loader);
    loaders.push(loader);

    const src = `/images/projects/${projectName}/${fileName}_${i + 1}.${fileExtention}`;
    const img = new Image();
    img.src = src;
    item.style.height = (280 / aspectRatio) + 3.5 + 'px';
    img.style.objectFit = objectFit ? 'contain' : 'cover';
    img.alt = `${projectName} ${i + 1}`;

    img.onload = () => {
      loadedCount++;
      if (loadedCount === count) {
        loaders.forEach(l => l.classList.add('fade-out'));

        setTimeout(() => {
          loaders.forEach(l => l.remove());
          document.querySelectorAll('.image-item').forEach(it => {
            it.style.height = '';
            it.classList.add('loaded');
          });
        }, 400);
      }
    };

    item.appendChild(img);
    projectImages.appendChild(item);

    const index = i;
    item.addEventListener('click', () => {
      const images = Array.from(projectImages.querySelectorAll('.image-item img')).map(img => img.src);
      setTimeout(() => {
        showViewer('images', null, null, null, images, index);
      }, isTouchDevice() ? remainingHighlightDelay : 0);
    });
  }

  function updateArrows() {
    const maxScrollLeft = projectImages.scrollWidth - projectImages.clientWidth;
    const tolerance = 1;

    if (projectImages.scrollLeft > tolerance) {
      leftArrow.classList.add('visible');
    } else {
      leftArrow.classList.remove('visible');
    }

    if (projectImages.scrollLeft < maxScrollLeft - tolerance) {
      rightArrow.classList.add('visible');
    } else {
      rightArrow.classList.remove('visible');
    }
  }

  updateArrows();
  projectImages.addEventListener('scroll', updateArrows);
  window.addEventListener('resize', updateArrows);

  [leftArrow, rightArrow].forEach(arrow => {
    let scrollInterval;
    let holdTimeout;

    const scrollAmount = projectImages.querySelector('.image-item') ? projectImages.querySelector('.image-item').offsetWidth + 12 : 280;

    arrow.addEventListener('click', e => {
      if (e.pointerType === 'touch') return;
      projectImages.scrollBy({ 
        left: arrow.dataset.direction === 'left' ? -scrollAmount : scrollAmount, 
        behavior: 'smooth' 
      });
    });

    arrow.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (e.pointerType === 'touch') return;

      holdTimeout = setTimeout(() => {
        scrollInterval = setInterval(() => {
          const step = 20;
          projectImages.scrollBy({ 
            left: arrow.dataset.direction === 'left' ? -step : step 
          });
        }, 16);
      }, 200);
    });

    arrow.addEventListener('mouseleave', () => {
      clearTimeout(holdTimeout);
      clearInterval(scrollInterval);
    });

    document.addEventListener('mouseup', () => {
      clearTimeout(holdTimeout);
      clearInterval(scrollInterval);
    });
  });
}

let viewerState = {
  images: [],
  captions: [],
  currentIndex: 0,
  zoomed: false,
  offsetX: 0,
  offsetY: 0,
  maxOffsetX: 0,
  maxOffsetY: 0,
  startX: 0,
  startY: 0,
  isDragging: false,
  isSwipe: false
};

const viewerArrowLeft = viewer.querySelector('.viewer-arrow.left');
const viewerArrowRight = viewer.querySelector('.viewer-arrow.right');
const viewerImage = viewer.querySelector('.viewer-image');
const viewerCode = document.getElementById('viewer-code');
const viewerCodePre = viewerCode.querySelector('pre');
const viewerFileName = document.getElementById('viewer-file-name');
const viewerCodeLines = document.getElementById('viewer-code-lines');
const viewerIndex = document.getElementById('viewer-index');
const viewerZoom = document.getElementById('viewer-zoom');
const viewerFullscreen = document.getElementById('viewer-fullscreen');
const viewerClose = document.getElementById('viewer-close');
const viewerImageMain = document.getElementById('viewer-image-main');
const viewerImageContainer = document.getElementById('viewer-image-container');
const viewerCaption = document.getElementById('viewer-caption');
const viewerThumbnailsWrapper = document.getElementById('viewer-thumbnails-wrapper');
const viewerThumbnails = document.getElementById('viewer-thumbnails');
const viewerThumbnailsContainer = document.getElementById('viewer-thumbnails-container');

let viewerCloseTimeout;

async function showViewer(content, file, language, encoding, images, index) {
  clearTimeout(viewerCloseTimeout);
  
  viewer.classList.add('active');

  viewerFullscreen.style.display = isAppleMobileDevice() ? 'none' : '';
  hideCustomScrollbar(overlay);

  navbar.style.boxShadow = 'none';
  navBlurOverlay.style.boxShadow = 'none';

  history.pushState({ viewer: true }, '');

  if (content == 'images') {
    viewer.classList.remove('code-mode');
    viewer.classList.add('image-mode');

    viewerState.images = images;
    viewerState.currentIndex = index;
    viewerState.zoomed = false;
    viewerState.offsetX = 0;
    viewerState.offsetY = 0;

    viewerArrowLeft.style.display = viewerState.images.length <= 1 ? 'none' : '';
    viewerArrowRight.style.display = viewerState.images.length <= 1 ? 'none' : '';
    viewerIndex.style.display = viewerState.images.length <= 1 ? 'none' : '';

    showUI();
    getProjectCaptions();
    renderThumbnails();
  } else if (content == 'code') {
    viewer.classList.remove('image-mode');
    viewer.classList.add('code-mode');
    showUI();

    viewerFileName.textContent = file.split('/').pop();
    viewerCodePre.innerHTML = '';

    const blob = await loadFile(file, 10);
    const buffer = await blob.arrayBuffer();
    const decoder = new TextDecoder(encoding || 'utf-8');
    const text = decoder.decode(buffer);

    const newCode = document.createElement('code');
    newCode.className = `language-${language}`;
    newCode.textContent = text;
    viewerCodePre.appendChild(newCode);

    if (window.hljs) hljs.highlightElement(newCode);

    const lines = text.split('\n');
    viewerCodeLines.innerHTML = lines.map((_, i) => `<span>${i + 1}</span>`).join('');

    viewerCodePre.style.paddingLeft = `${viewerCodeLines.offsetWidth + 12}px`;

    updateCodeScrollbar();
  }
}

function closeViewer() {
  viewer.classList.remove('active');

  exitFullscreen();
  navbar.style.boxShadow = '';
  navBlurOverlay.style.boxShadow = '';

  viewerCloseTimeout = setTimeout(() => {
    viewerCodePre.innerHTML = '';
    viewerCodePre.style.paddingLeft = '0';
    viewerCodeLines.innerHTML = '';

    resetZoom();
    viewerState.isDragging = false;
    viewerState.isSwipe = false;
    viewerState.dragged = false;
    viewerState.maxOffsetX = 0;
    viewerState.maxOffsetY = 0;

    viewerImage.style.transition = 'none';
    viewerImage.style.opacity = '1';

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    hideUI();
    if (!isTouchDevice()) resetInactivityTimer();
    viewer.classList.remove('image-mode');
    viewer.classList.remove('code-mode');
  }, 300);
}

viewerClose.addEventListener('click', () => {
  setTimeout(closeViewer, isTouchDevice() ? remainingHighlightDelay : 0);
});

function exitFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
}

const viewerFullscreenPath = viewerFullscreen.querySelector('path');
const fullscreenPath = viewerFullscreenPath.getAttribute('d');
const exitFullscreenPath = 'M5.5 0a.5.5 0 0 1 .5.5v4A1.5 1.5 0 0 1 4.5 6h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5zm5 0a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 10 4.5v-4a.5.5 0 0 1 .5-.5zM0 10.5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 6 11.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zm10 1a1.5 1.5 0 0 1 1.5-1.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4z'

viewerFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    viewer.requestFullscreen().then(() => {
      viewerFullscreenPath.setAttribute('d', exitFullscreenPath);
    });
  } else {
    exitFullscreen();
  }
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    viewerFullscreenPath.setAttribute('d', fullscreenPath);
  }

  updateViewer(true);
  updateViewerCaptionPosition();
});

function updateViewer(instant = false, resZoom = true, disableImgFade = false) {
  const idx = viewerState.currentIndex;

  if (instant) {
    viewerImage.style.transition = 'none';
    viewerImage.src = viewerState.images[idx];
    viewerCaption.textContent = viewerState.captions[idx] || '';
    viewerIndex.textContent = `${idx+1}/${viewerState.images.length}`;
    if (resZoom) resetZoom();
    highlightThumbnail(idx);
    scrollThumbnailIntoView(idx, false);
    updateImagesScrollbar();
  } else {
    if (!disableImgFade) {
      viewerImage.style.transition = 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
      viewerImage.style.opacity = 0;
    }

    if (resZoom) resetZoom();

    setTimeout(() => {
      viewerImage.src = viewerState.images[idx];
      viewerCaption.textContent = viewerState.captions[idx] || '';
      viewerIndex.textContent = `${idx+1}/${viewerState.images.length}`;
      viewerImage.style.opacity = 1;
    }, 100);

    highlightThumbnail(idx);
    scrollThumbnailIntoView(idx);
  }
}

viewerArrowLeft.addEventListener('click', ()=> changeImage(-1));
viewerArrowRight.addEventListener('click', ()=> changeImage(1));

function changeImage(dir){
  if (viewerState.images.length <= 1 || swipeClone || viewerState.isDragging || viewerState.velocityActive) return;
  
  viewerState.currentIndex = (viewerState.currentIndex + dir + viewerState.images.length) % viewerState.images.length;
  updateViewer();
}

viewerZoom.addEventListener('click', () => toggleZoom());
viewerImage.addEventListener('click', e => {
  if (viewerState.dragged || viewerState.isSwipe) {
    viewerState.dragged = false;
    viewerState.isSwipe = false;
    return;
  }

  if (!viewerState.zoomed) {
    const rect = viewerImage.getBoundingClientRect();
    toggleZoom(
      (e.clientX - rect.left) / rect.width,
      (e.clientY - rect.top) / rect.height
    );
  } else {
    toggleZoom();
  }
});

const viewerZoomPath = viewerZoom.querySelector('path');
const zoomInPath = viewerZoomPath.getAttribute('d');
const zoomOutPath = 'M8.195 0c4.527 0 8.196 3.62 8.196 8.084a7.989 7.989 0 0 1-1.977 5.267l5.388 5.473a.686.686 0 0 1-.015.98a.71.71 0 0 1-.993-.014l-5.383-5.47a8.23 8.23 0 0 1-5.216 1.849C3.67 16.169 0 12.549 0 8.084C0 3.62 3.67 0 8.195 0Zm0 1.386c-3.75 0-6.79 2.999-6.79 6.698c0 3.7 3.04 6.699 6.79 6.699s6.791-3 6.791-6.699c0-3.7-3.04-6.698-6.79-6.698Zm3.78 5.868c.387 0 .702.31.702.693a.698.698 0 0 1-.703.693H4.636a.698.698 0 0 1-.702-.693c0-.383.314-.693.702-.693h7.338Z'

function resetZoom() {
  viewerState.zoomed = false;
  viewerState.offsetX = 0;
  viewerState.offsetY = 0;

  viewerImage.style.borderRadius = '';
  viewerImage.style.transform = 'translate(0, 0) scale(1)';
  viewerImage.style.cursor = 'zoom-in';
  viewerZoomPath.setAttribute('d', zoomInPath);
}

function toggleZoom(relX = 0.5, relY = 0.5) {
  if (swipeClone || viewerState.isDragging || viewerState.velocityActive) return;

  const containerRect = viewerImageMain.getBoundingClientRect();
  const imgRect = viewerImage.getBoundingClientRect();

  viewerImage.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)';

  if (!viewerState.zoomed) {
    const scaleX = containerRect.width / imgRect.width;
    const scaleY = containerRect.height / imgRect.height;
    const scale = Math.max(Math.max(scaleX, scaleY), 2);

    let offsetX = (0.5 - relX) * imgRect.width * scale;
    let offsetY = (0.5 - relY) * imgRect.height * scale;

    const maxOffsetX = Math.max(0, (imgRect.width * scale - containerRect.width) / 2);
    const maxOffsetY = Math.max(0, (imgRect.height * scale - containerRect.height) / 2);

    viewerState.zoomed = true;
    viewerState.offsetX = clamp(offsetX, -maxOffsetX, maxOffsetX);
    viewerState.offsetY = clamp(offsetY, -maxOffsetY, maxOffsetY);
    viewerState.maxOffsetX = maxOffsetX;
    viewerState.maxOffsetY = maxOffsetY;
    viewerState.Scale = scale;

    viewerImage.style.borderRadius = '0';
    viewerImage.style.transform = `translate(${viewerState.offsetX}px, ${viewerState.offsetY}px) scale(${scale})`;
    viewerImage.style.cursor = 'grab';
    viewerZoomPath.setAttribute('d', zoomOutPath);
  } else resetZoom();
}

let animationFrameId = null;
let activeMode = null;
let swipeClone = null;
let cloneCreated = false;
let swipeDirection = 0;
let lastTargetIndex = null;
const gap = 40;
const swipeDeadZone = 50;

function createSwipeClone(src) {
  if (!swipeClone) {
    swipeClone = viewerImage.cloneNode(true);
    swipeClone.src = src;

    Object.assign(swipeClone.style, {
      position: 'absolute',
      pointerEvents: 'none',
      width: viewerImage.offsetWidth + 'px',
      height: viewerImage.offsetHeight + 'px',
    });

    viewerImageContainer.appendChild(swipeClone);
  } else {
    swipeClone.src = src;
  }
}

function removeSwipeClone() {
  if (!swipeClone) return;

  swipeClone.remove();
  swipeClone = null;
  cloneCreated = false;
  swipeDirection = 0;
  lastTargetIndex = null;
}

function getClientX(e) {
  if (e.touches && e.touches[0]) return e.touches[0].clientX;
  if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientX;
  return e.clientX;
}
function getClientY(e) {
  if (e.touches && e.touches[0]) return e.touches[0].clientY;
  if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY;
  return e.clientY;
}

function startSwipeDrag(e) {
  if (e.type === 'mousedown' && e.button !== 0) return;
  if (e.touches && e.touches.length > 1) return;

  e.preventDefault();

  viewerState.dragged = false;
  viewerState.startX = getClientX(e);
  viewerState.startY = getClientY(e);
  viewerState.swipeAxis = null;
  viewerState.lastMouseX = viewerState.startX;
  viewerState.lastMouseY = viewerState.startY;

  if (e.type === 'touchstart') {
    const now = Date.now();
    if (now - (viewerState.lastTapTime || 0) < doubleTapDelay) {
      const touch = e.touches[0];
      const rect = viewerImage.getBoundingClientRect();
      toggleZoom((touch.clientX - rect.left) / rect.width, (touch.clientY - rect.top) / rect.height);
      viewerState.lastTapTime = 0;
      return;
    }
    viewerState.lastTapTime = now;
  }

  if (viewerState.zoomed) {
    activeMode = 'drag';
    viewerState.isDragging = true;
    viewerImage.style.cursor = 'grabbing';
    removeSwipeClone();
  } else {
    activeMode = 'swipe';
    viewerState.isSwipe = true;
    viewerImage.style.cursor = 'grabbing';
    removeSwipeClone();
  }
}
viewerImage.addEventListener('mousedown', startSwipeDrag);
viewerImage.addEventListener('touchstart', startSwipeDrag);

function moveSwipeDrag(e) {
  const clientX = getClientX(e);
  const clientY = getClientY(e);
  viewerState.lastMouseX = clientX;
  viewerState.lastMouseY = clientY;

  if (activeMode === 'drag' && viewerState.isDragging && viewerState.zoomed) {
    const dx = clientX - viewerState.startX;
    const dy = clientY - viewerState.startY;

    if (dx !== 0 || dy !== 0) viewerState.dragged = true;

    viewerState.velocityX = dx;
    viewerState.velocityY = dy;

    viewerState.startX = clientX;
    viewerState.startY = clientY;

    const elasticity = 0.8;
    let nextX = viewerState.offsetX + dx;
    let nextY = viewerState.offsetY + dy;

    if (nextX > viewerState.maxOffsetX) nextX = viewerState.maxOffsetX + (nextX - viewerState.maxOffsetX) * elasticity;
    if (nextX < -viewerState.maxOffsetX) nextX = -viewerState.maxOffsetX + (nextX + viewerState.maxOffsetX) * elasticity;

    if (nextY > viewerState.maxOffsetY) nextY = viewerState.maxOffsetY + (nextY - viewerState.maxOffsetY) * elasticity;
    if (nextY < -viewerState.maxOffsetY) nextY = -viewerState.maxOffsetY + (nextY + viewerState.maxOffsetY) * elasticity;

    viewerState.offsetX = nextX;
    viewerState.offsetY = nextY;

    if (!animationFrameId) {
      animationFrameId = requestAnimationFrame(() => {
        viewerImage.style.transition = 'transform 0.08s ease-out';
        viewerImage.style.transform = `translate(${viewerState.offsetX}px, ${viewerState.offsetY}px) scale(${viewerState.Scale})`;
        animationFrameId = null;
      });
    }
    return;
  }

  if (activeMode === 'swipe' && viewerState.isSwipe && !viewerState.zoomed) {
    const dx = clientX - viewerState.startX;
    const dy = clientY - viewerState.startY;

    if (!viewerState.swipeAxis) {
      const dx = clientX - viewerState.startX;
      const dy = clientY - viewerState.startY;
      if (Math.abs(dx) > 15) {
        viewerState.swipeAxis = 'x';
      } else if (Math.abs(dy) > 15) {
        viewerState.swipeAxis = 'y';
      } else {
        return;
      }
    }

    if (viewerState.swipeAxis === 'y') {
      viewerImage.style.transition = 'none';
      viewerImage.style.transform = `translateY(${dy}px) scale(1)`;
      viewerState.dragged = true;
      return;
    } else if (viewerState.swipeAxis === 'x') {
      if (viewerState.images.length <= 1) {
        viewerImage.style.cursor = 'zoom-in';
        return;
      }

      viewerImage.style.transition = 'none';
      viewerImage.style.transform = `translateX(${dx}px) scale(1)`;
      viewerState.dragged = true;

      const containerWidth = viewerImageMain.clientWidth;
      const newDirection = dx < 0 ? -1 : 1;

      if (lastTargetIndex !== newDirection) {
        swipeDirection = newDirection;
        lastTargetIndex = newDirection;
        const targetIndex =
          (viewerState.currentIndex +
            (swipeDirection === -1 ? 1 : -1) +
            viewerState.images.length) %
          viewerState.images.length;
        createSwipeClone(viewerState.images[targetIndex]);
        cloneCreated = true;
        const initialX = swipeDirection === -1 ? containerWidth + gap : -containerWidth - gap;
        swipeClone.style.transform = `translateX(${initialX}px)`;
      }

      if (cloneCreated && swipeClone) {
        const cloneX = swipeDirection === -1 ? containerWidth + dx + gap : -containerWidth + dx - gap;
        swipeClone.style.transform = `translateX(${cloneX}px)`;
      }
    }
  }
}
document.addEventListener('mousemove', moveSwipeDrag);
document.addEventListener('touchmove', moveSwipeDrag);

function endSwipeDrag(e) {
  if (activeMode === 'drag' && viewerState.zoomed) {
    viewerState.isDragging = false;
    activeMode = null;
    viewerImage.style.cursor = 'grab';

    const decay = 0.95;
    viewerState.velocityActive = true;

    const frame = () => {
      viewerState.offsetX += viewerState.velocityX;
      viewerState.offsetY += viewerState.velocityY;

      if (viewerState.offsetX > viewerState.maxOffsetX) viewerState.offsetX = viewerState.maxOffsetX + (viewerState.offsetX - viewerState.maxOffsetX) * 0.5;
      if (viewerState.offsetX < -viewerState.maxOffsetX) viewerState.offsetX = -viewerState.maxOffsetX + (viewerState.offsetX + viewerState.maxOffsetX) * 0.5;
      if (viewerState.offsetY > viewerState.maxOffsetY) viewerState.offsetY = viewerState.maxOffsetY + (viewerState.offsetY - viewerState.maxOffsetY) * 0.5;
      if (viewerState.offsetY < -viewerState.maxOffsetY) viewerState.offsetY = -viewerState.maxOffsetY + (viewerState.offsetY + viewerState.maxOffsetY) * 0.5;

      viewerImage.style.transform = `translate(${viewerState.offsetX}px, ${viewerState.offsetY}px) scale(${viewerState.Scale})`;

      viewerState.velocityX *= decay;
      viewerState.velocityY *= decay;

      if (Math.abs(viewerState.velocityX) > 0.5 || Math.abs(viewerState.velocityY) > 0.5) {
        requestAnimationFrame(frame);
      } else {
        viewerState.velocityActive = false;
        viewerState.offsetX = clamp(viewerState.offsetX, -viewerState.maxOffsetX, viewerState.maxOffsetX);
        viewerState.offsetY = clamp(viewerState.offsetY, -viewerState.maxOffsetY, viewerState.maxOffsetY);
        viewerImage.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        viewerImage.style.transform = `translate(${viewerState.offsetX}px, ${viewerState.offsetY}px) scale(${viewerState.Scale})`;
      }
    };
    frame();
  }

  const clientX = getClientX(e);
  const clientY = getClientY(e);

  if (activeMode === 'swipe' && viewerState.isSwipe) {
    const dx = clientX - viewerState.startX;
    const dy = clientY - viewerState.startY;
    const containerWidth = viewerImageMain.clientWidth;

    if (viewerState.swipeAxis === 'y') {
      if (Math.abs(dy) > swipeDeadZone) {
        viewerImage.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        viewerImage.style.transform = `translateY(${dy > 0 ? '100%' : '-100%'}) scale(1)`;
        viewerImage.style.opacity = '0';
        closeViewer();
      } else {
        viewerImage.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        viewerImage.style.transform = 'translateY(0) scale(1)';
      }
      viewerImage.style.cursor = 'zoom-in';
      return;
    } else if (viewerState.swipeAxis === 'x') {

      if (Math.abs(dx) < swipeDeadZone) {
        viewerImage.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        viewerImage.style.transform = 'translateX(0) scale(1)';
        viewerImage.style.cursor = 'zoom-in';
        removeSwipeClone();
        return;
      }

      if (cloneCreated && swipeClone) {
        viewerImage.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        swipeClone.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

        viewerImage.style.transform = `translateX(${swipeDirection === -1 ? -containerWidth - gap : containerWidth + gap}px) scale(1)`;
        swipeClone.style.transform = `translateX(0px)`;
        setTimeout(() => {
          viewerState.currentIndex = swipeDirection === -1 ? (viewerState.currentIndex + 1) % viewerState.images.length : (viewerState.currentIndex - 1 + viewerState.images.length) % viewerState.images.length;
          viewerImage.src = swipeClone.src;
          viewerImage.style.transition = 'none';
          viewerImage.style.transform = 'translateX(0) scale(1)';
          removeSwipeClone();
          updateViewer(false, false, true);
        }, 300);
      }
    }
    viewerState.swipeAxis = null;
    viewerState.isSwipe = false;
    cloneCreated = false;
    activeMode = null;
    viewerImage.style.cursor = 'zoom-in';
  }
}
document.addEventListener('mouseup', endSwipeDrag);
document.addEventListener('touchend', endSwipeDrag);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

document.addEventListener('keydown', e=>{
  if(!isViewerVisible() || chatWindow.classList.contains('open')) return;
  if(e.key === 'ArrowLeft') changeImage(-1); e.preventDefault();
  if(e.key === 'ArrowRight') changeImage(1); e.preventDefault();
});

let inactivityTimer;
const inactivityDelay = 3000;
let tapTimer = null;
let touchStartX = 0;
let touchStartY = 0;

const tapThreshold = 10;
const doubleTapDelay = 300;

function showUI() {
  if (!isViewerVisible() || chatWindow.classList.contains('open')) return;

  viewer.querySelectorAll('.viewer-arrow, #viewer-controls-wrapper').forEach(el => {
    el.style.opacity = '1';
    el.style.pointerEvents = 'auto';
  });

  viewerIndex.style.opacity = '1';
  viewerCaption.style.opacity = '1';
  if (!isTouchDevice()) resetInactivityTimer();
}

function hideUI() {
  if (!viewer.classList.contains('code-mode')) {
    viewer.querySelectorAll('.viewer-arrow, #viewer-controls-wrapper').forEach(el => {
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
    });

    viewerIndex.style.opacity = '0';
    viewerCaption.style.opacity = '0';
  }
}

hideUI();

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(hideUI, inactivityDelay);
}

['mousemove','mousedown','keydown'].forEach(event => {
  if (isTouchDevice()) return;
  document.addEventListener(event, showUI);
});

viewerImageMain.addEventListener('touchstart', e => {
  if (!isViewerVisible() || !e.touches[0]) return;
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
});

viewerImageMain.addEventListener('touchend', e => {
  if (!isViewerVisible() || !e.changedTouches[0]) return;

  const touch = e.changedTouches[0];
  const dx = Math.abs(touch.clientX - touchStartX);
  const dy = Math.abs(touch.clientY - touchStartY);

  if (dx > tapThreshold || dy > tapThreshold || viewerArrowLeft.contains(e.target) || viewerArrowRight.contains(e.target)) return;

  if (tapTimer) {
    clearTimeout(tapTimer);
    tapTimer = null;
    return;
  }

  tapTimer = setTimeout(() => {
    const controlsWrapper = document.getElementById('viewer-controls-wrapper');
    const currentOpacity = parseFloat(getComputedStyle(controlsWrapper).opacity) || 0;

    if (currentOpacity === 0) {
      showUI();
    } else {
      hideUI();
    }

    tapTimer = null;
  }, doubleTapDelay);
});

function renderThumbnails() {
  if (viewerState.images.length <= 1) {
    viewerThumbnailsWrapper.style.display = 'none';
    return;
  } else {
    viewerThumbnailsWrapper.style.display = '';
  }

  viewerThumbnailsContainer.innerHTML = '';
  
  viewerState.images.forEach((src, i) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'thumb-wrapper';

    const img = document.createElement('img');
    img.src = src;

    img.addEventListener('click', () => {
      if (i === viewerState.currentIndex) return;
      viewerState.currentIndex = i;
      updateViewer();
    });

    const overlay = document.createElement('div');
    overlay.className = 'thumb-overlay';

    wrapper.appendChild(img);
    wrapper.appendChild(overlay);
    viewerThumbnailsContainer.appendChild(wrapper);
  });

  requestAnimationFrame(() => {
    updateViewerCaptionPosition();
  });
  highlightThumbnail(viewerState.currentIndex);
  scrollThumbnailIntoView(viewerState.currentIndex);
  updateImagesScrollbar();
}

function highlightThumbnail(idx){
  viewerThumbnailsContainer.querySelectorAll('.thumb-wrapper').forEach((t, i)=>{
    t.classList.toggle('active', i === idx);
  });
}

function scrollThumbnailIntoView(idx, smooth = true) {
  const activeThumb = viewerThumbnailsContainer.querySelectorAll('img')[idx];
  if (activeThumb) {
    activeThumb.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto'
    });
  }
}

const codeScrollbar = document.getElementById('viewer-code-scrollbar');
const codeScrollbarThumb = document.getElementById('viewer-code-scrollbar-thumb');
const codeScrollbarH = document.getElementById('viewer-code-scrollbar-horizontal');
const codeScrollbarThumbH = document.getElementById('viewer-code-scrollbar-thumb-horizontal');
const imagesScrollbar = document.getElementById('viewer-images-scrollbar');
const imagesScrollbarThumb = document.getElementById('viewer-images-scrollbar-thumb');

let isDraggingScrollbar = false;
let isDraggingScrollbarH = false;
let dragStartY = 0;
let startScrollTop = 0;
let dragStartX = 0;
let startScrollLeft = 0;

function updateCodeScrollbar() {
  const scrollableHeight = viewerCode.scrollHeight - viewerCode.clientHeight;
  const scrollableWidth = viewerCode.scrollWidth - viewerCode.clientWidth;

  if (scrollableHeight > 0) {
    codeScrollbar.style.display = 'block';
    codeScrollbarH.style.right = '12px';
    const scrollPercentY = viewerCode.scrollTop / scrollableHeight;
    const thumbHeight = Math.max((viewerCode.clientHeight / viewerCode.scrollHeight) * 100, 3);
    codeScrollbarThumb.style.height = `${thumbHeight}%`;
    codeScrollbarThumb.style.top = `${scrollPercentY * (100 - thumbHeight)}%`;
  } else {
    codeScrollbar.style.display = 'none';
    codeScrollbarH.style.right = '0';
  }

  if (scrollableWidth > 0) {
    codeScrollbarH.style.display = 'block';
    const scrollPercentX = viewerCode.scrollLeft / scrollableWidth;
    const thumbWidth = Math.max((viewerCode.clientWidth / viewerCode.scrollWidth) * 100, 3);
    codeScrollbarThumbH.style.width = `${thumbWidth}%`;
    codeScrollbarThumbH.style.left = `${scrollPercentX * (100 - thumbWidth)}%`;
  } else {
    codeScrollbarH.style.display = 'none';
  }
}

function updateImagesScrollbar() {
  const scrollableWidth = viewerThumbnails.scrollWidth - viewerThumbnails.clientWidth;

  if (scrollableWidth <= 0) {
    imagesScrollbar.style.display = 'none';
    viewerThumbnails.style.padding = '6px';
    return;
  } else {
    imagesScrollbar.style.display = 'block';
    viewerThumbnails.style.padding = `6px 6px ${imagesScrollbar.offsetHeight + 6}px`;
  }

  const scrollPercent = viewerThumbnails.scrollLeft / (viewerThumbnails.scrollWidth - viewerThumbnails.clientWidth);
  const thumbWidth = viewerThumbnails.clientWidth / viewerThumbnails.scrollWidth * 100;
  imagesScrollbarThumb.style.width = `${thumbWidth}%`;
  imagesScrollbarThumb.style.left = `${scrollPercent * (100 - thumbWidth)}%`;
}

viewerCode.addEventListener('scroll', updateCodeScrollbar);
viewerThumbnails.addEventListener('scroll', updateImagesScrollbar);

codeScrollbar.addEventListener('mousedown', e => {
  if (e.button !== 0 || e.target === codeScrollbarThumb) return;

  if (!isTouchDevice()) codeScrollbar.classList.add('dragging');

  const rect = codeScrollbar.getBoundingClientRect();
  const clickY = e.clientY - rect.top;

  const thumbHeightPx = codeScrollbarThumb.clientHeight;
  const maxThumbMove = codeScrollbar.clientHeight - thumbHeightPx;

  const scrollableHeight = viewerCode.scrollHeight - viewerCode.clientHeight;

  const newThumbTop = Math.min(Math.max(clickY - thumbHeightPx / 2, 0), maxThumbMove);
  const scrollPercent = newThumbTop / maxThumbMove;
  viewerCode.scrollTop = scrollPercent * scrollableHeight;

  isDraggingScrollbar = true;
  dragStartY = e.clientY;
  startScrollTop = viewerCode.scrollTop;
  document.body.style.cursor = 'grabbing';

  e.preventDefault();
});

codeScrollbarThumb.addEventListener('mousedown', e => {
  if (e.button !== 0) return;

  codeScrollbar.classList.add('dragging');
  
  isDraggingScrollbar = true;
  dragStartY = e.clientY;
  startScrollTop = viewerCode.scrollTop;
  document.body.style.cursor = 'grabbing';

  e.preventDefault();
});

codeScrollbarH.addEventListener('mousedown', e => {
  if (e.button !== 0 || e.target === codeScrollbarThumbH) return;

  if (!isTouchDevice()) codeScrollbarH.classList.add('dragging');

  const rect = codeScrollbarH.getBoundingClientRect();
  const clickX = e.clientX - rect.left;

  const thumbWidthPx = codeScrollbarThumbH.clientWidth;
  const maxThumbMove = codeScrollbarH.clientWidth - thumbWidthPx;

  const scrollableWidth = viewerCode.scrollWidth - viewerCode.clientWidth;

  const newThumbLeft = Math.min(Math.max(clickX - thumbWidthPx / 2, 0), maxThumbMove);
  const scrollPercent = newThumbLeft / maxThumbMove;
  viewerCode.scrollLeft = scrollPercent * scrollableWidth;

  isDraggingScrollbarH = true;
  dragStartX = e.clientX;
  startScrollLeft = viewerCode.scrollLeft;
  document.body.style.cursor = 'grabbing';

  e.preventDefault();
});

codeScrollbarThumbH.addEventListener('mousedown', e => {
  if (e.button !== 0) return;

  codeScrollbarH.classList.add('dragging');

  isDraggingScrollbarH = true;
  dragStartX = e.clientX;
  startScrollLeft = viewerCode.scrollLeft;
  document.body.style.cursor = 'grabbing';

  e.preventDefault();
});

imagesScrollbar.addEventListener('mousedown', e => {
  if (e.button !== 0 || e.target === imagesScrollbarThumb) return;

  if (!isTouchDevice()) imagesScrollbar.classList.add('dragging');

  const rect = imagesScrollbar.getBoundingClientRect();
  const clickX = e.clientX - rect.left;

  const thumbWidthPx = imagesScrollbarThumb.clientWidth;
  const maxThumbMove = imagesScrollbar.clientWidth - thumbWidthPx;

  const scrollableWidth = viewerThumbnails.scrollWidth - viewerThumbnails.clientWidth;

  const newThumbLeft = Math.min(Math.max(clickX - thumbWidthPx / 2, 0), maxThumbMove);
  const scrollPercent = newThumbLeft / maxThumbMove;
  viewerThumbnails.scrollLeft = scrollPercent * scrollableWidth;

  isDraggingScrollbarH = true;
  dragStartX = e.clientX;
  startScrollLeft = viewerThumbnails.scrollLeft;
  document.body.style.cursor = 'grabbing';

  e.preventDefault();
});

imagesScrollbarThumb.addEventListener('mousedown', e => {
  if (e.button !== 0) return;

  imagesScrollbar.classList.add('dragging');
  
  isDraggingScrollbarH = true;
  dragStartX = e.clientX;
  startScrollLeft = viewerThumbnails.scrollLeft;
  document.body.style.cursor = 'grabbing';
  
  e.preventDefault();
});

document.addEventListener('mousemove', e => {
  if (viewer.classList.contains('code-mode')) {
    const dy = e.clientY - dragStartY;
    const dx = e.clientX - dragStartX;

    const scrollableHeight = viewerCode.scrollHeight - viewerCode.clientHeight;
    const scrollbarHeight = codeScrollbar.clientHeight;
    const thumbHeight = codeScrollbarThumb.clientHeight;
    const maxThumbMoveY = scrollbarHeight - thumbHeight;

    if (scrollableHeight > 0 && isDraggingScrollbar) {
      const scrollRatioY = scrollableHeight / maxThumbMoveY;
      viewerCode.scrollTop = startScrollTop + dy * scrollRatioY;
    }

    const scrollableWidth = viewerCode.scrollWidth - viewerCode.clientWidth;
    const scrollbarWidth = codeScrollbarH.clientWidth;
    const thumbWidth = codeScrollbarThumbH.clientWidth;
    const maxThumbMoveX = scrollbarWidth - thumbWidth;

    if (scrollableWidth > 0 && isDraggingScrollbarH) {
      const scrollRatioX = scrollableWidth / maxThumbMoveX;
      viewerCode.scrollLeft = startScrollLeft + dx * scrollRatioX;
    }
  } else if (viewer.classList.contains('image-mode') && isDraggingScrollbarH) {
    const dx = e.clientX - dragStartX;
    const scrollableWidth = viewerThumbnails.scrollWidth - viewerThumbnails.clientWidth;
    const scrollbarWidth = imagesScrollbar.clientWidth;
    const thumbWidth = imagesScrollbarThumb.clientWidth;
    const maxThumbMove = scrollbarWidth - thumbWidth;

    const scrollRatio = scrollableWidth / maxThumbMove;
    viewerThumbnails.scrollLeft = startScrollLeft + dx * scrollRatio;
  }
});

document.addEventListener('mouseup', () => {
  if (!isTouchDevice()) {
    codeScrollbar.classList.remove('dragging');
    codeScrollbarH.classList.remove('dragging');
    imagesScrollbar.classList.remove('dragging');
  }

  isDraggingScrollbar = false;
  isDraggingScrollbarH = false;
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 800 && navbar.classList.contains('menu-open')) closeNavLinks(false, true);
  applyOverlayLayout();
  if (viewer.classList.contains('code-mode')) {
    updateCodeScrollbar();
  } else if (viewer.classList.contains('image-mode')) {
    if (viewerState.zoomed) resetZoom();
    updateImagesScrollbar();
    scrollThumbnailIntoView(viewerState.currentIndex, false);
    updateViewerCaptionPosition();
  }
});

const resizeObserver = new ResizeObserver(() => {
  if (viewer.classList.contains('code-mode')) {
    updateCodeScrollbar();
  } else if (viewer.classList.contains('image-mode')) {
    updateImagesScrollbar();
    scrollThumbnailIntoView(viewerState.currentIndex, false);
  }
});

resizeObserver.observe(viewerCode);
resizeObserver.observe(viewerThumbnails);

function updateViewerCaptionPosition() {
  if (!viewerCaption || !viewerThumbnailsWrapper) return;

  const rect = viewerThumbnailsWrapper.getBoundingClientRect();
  const viewportHeight = window.innerHeight;

  viewerCaption.style.bottom = `${viewportHeight - rect.top + 6}px`; 
}

document.querySelectorAll('a').forEach(link => {
  link.addEventListener('dragstart', e => e.preventDefault());
});

const projectVideoWrapper = document.querySelector('.project-video-wrapper')
const iframe = projectVideoWrapper.querySelector('.youtube-player');

let player;

function initYouTubePlayer() {
  if (!iframe) return;

  const src = iframe.getAttribute('src');
  const match = src.match(/\/embed\/([a-zA-Z0-9_-]+)/);
  const videoId = match ? match[1] : null;

  if (!window.YT) {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  } else if (typeof YT.Player === 'function') {
    createPlayer();
  }

  window.onYouTubeIframeAPIReady = createPlayer;

  function createPlayer() {
    if (player) return;
    player = new YT.Player(iframe, {
      videoId: videoId,
      events: {
        onReady: () => {
          const loader = projectVideoWrapper.querySelector('.media-loader');
          if (loader) {
            loader.classList.add('fade-out');
            setTimeout(() => {
              loader.remove();
              projectVideoWrapper.classList.add('loaded');
            }, 400);
          }
        }
      }
    });
  }
}

function pauseVideo() {
  if (player && typeof player.pauseVideo === 'function') {
    player.pauseVideo();
  }
}

document.querySelectorAll('.link-card').forEach(card => {
  const icon = card.querySelector('.link-card-icon');
  const copyBtn = card.querySelector('.copy');
  const url = card.href;

  const fallbackIcon = 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white">
        <path d="M16.36 14c.08-.66.14-1.32.14-2c0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2m-5.15 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56M14.34 14H9.66c-.1-.66-.16-1.32-.16-2c0-.68.06-1.35.16-2h4.68c.09.65.16 1.32.16 2c0 .68-.07 1.34-.16 2M12 19.96c-.83-1.2-1.5-2.53-1.91-3.96h3.82c-.41 1.43-1.08 2.76-1.91 3.96M8 8H5.08A7.923 7.923 0 0 1 9.4 4.44C8.8 5.55 8.35 6.75 8 8m-2.92 8H8c.35 1.25.8 2.45 1.4 3.56A8.008 8.008 0 0 1 5.08 16m-.82-2C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2c0 .68.06 1.34.14 2M12 4.03c.83 1.2 1.5 2.54 1.91 3.97h-3.82c.41-1.43 1.08-2.77 1.91-3.97M18.92 8h-2.95a15.65 15.65 0 0 0-1.38-3.56c1.84.63 3.37 1.9 4.33 3.56M12 2C6.47 2 2 6.5 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2Z"/>
    </svg>
  `);

  try {
    const { hostname } = new URL(url);
    const base = `https://${hostname}`;

    icon.src = `${base}/favicon.svg`;

    icon.onerror = () => {
      icon.onerror = () => {
        icon.src = fallbackIcon;
      };
      icon.src = `${base}/favicon.ico`;
    };
  } catch (e) {
    icon.src = fallbackIcon;
  }

  enableTouchHighlight(card, 0, { ignoreSelector: '.copy' });

  copyBtn.addEventListener('click', e => {
    e.preventDefault();
    navigator.clipboard.writeText(url).then(() => {
      showNotification(t(`Ссылка скопирована: ${url}`, `Copied URL: ${url}`), 3000);
    });
  });

  if (!isTouchDevice()) return;

  card.addEventListener('click', e => {
    if (e.target.closest('.copy')) return;

    e.preventDefault();

    setTimeout(() => {
      window.open(url, '_blank', 'noopener, noreferrer');
    }, remainingHighlightDelay);
  });
});

let remainingHighlightDelay = 300;

function enableTouchHighlight(el, delay = 0, options = {}) {
  if (!el) return;

  const ignoreSelector = options.ignoreSelector || null;

  let touchHighlightDelay = 300;
  let scrollDelay = 80;

  let isScrolling = false;
  let scrollTimeout;
  let highlightTimeout;
  let lastTouchTime = 0;
  let touchStartTime = 0;

  function addHighlight() {
    el.classList.add('touch-highlight');
    lastTouchTime = Date.now();
  }

  function removeHighlight() {
    el.classList.remove('touch-highlight');
  }

  function isTouchInside(touch) {
    const rect = el.getBoundingClientRect();
    return (
      touch.clientX >= rect.left &&
      touch.clientX <= rect.right &&
      touch.clientY >= rect.top &&
      touch.clientY <= rect.bottom
    );
  }

  el.addEventListener('touchstart', e => {
    if (ignoreSelector && e.target.closest(ignoreSelector)) return;

    const now = Date.now();
    if (now - lastTouchTime < (remainingHighlightDelay + 100)) return;

    touchStartTime = now;
    isScrolling = false;
    clearTimeout(scrollTimeout);
    clearTimeout(highlightTimeout);

    scrollTimeout = setTimeout(() => {
      if (!isScrolling) addHighlight();
    }, scrollDelay);
  });

  el.addEventListener('touchmove', e => {
    const touch = e.touches[0];
    if (!isTouchInside(touch)) {
      isScrolling = true;
      clearTimeout(scrollTimeout);
      clearTimeout(highlightTimeout);
      removeHighlight();
      return;
    }

    isScrolling = true;
    clearTimeout(scrollTimeout);
  });

  el.addEventListener('touchend', () => {
    const touchDuration = Date.now() - touchStartTime;
    remainingHighlightDelay = (delay > 0 ? delay : Math.max(touchHighlightDelay - touchDuration, 0)) + scrollDelay;

    clearTimeout(highlightTimeout);
    highlightTimeout = setTimeout(removeHighlight, remainingHighlightDelay);
  });

  el.addEventListener('touchcancel', () => {
    clearTimeout(scrollTimeout);
    clearTimeout(highlightTimeout);
    removeHighlight();
  });
}

const defaultSelector = [
  '#nav-links a', '#chat-button', '#chat-close', '#chat-send', '#overlay-back', '.overlay-button', '#viewer-top-bar svg', '.viewer-arrow'
];
const longHighlightSelector = [
  '.projects-list a', '.socials-list a'
];

document.querySelectorAll(defaultSelector.join(', ')).forEach(el => enableTouchHighlight(el));

document.querySelectorAll(longHighlightSelector.join(', ')).forEach(el => enableTouchHighlight(el, 220));

const langBg = document.getElementById('lang-bg');
const langOptions = document.querySelectorAll('.lang-option');

let resetAnimationTimeout;
let currentLang = null;

const translations = {
  'nav-link-1': "АВТОР",
  'nav-link-2': "ПОРТФОЛИО",
  'nav-link-3': "СОЦСЕТИ",

  'chat-header': 'ИИ-АССИСТЕНТ',
  'chat-close-label': 'ЗАКРЫТЬ',

  'about-header': 'ОБО МНЕ',
  'about-text-1': 'Привет! Я Мухаммед',
  'about-text-2': 'Также Bredd Lane',
  'about-text-3': 'Из Азербайджана',
  'about-text-4': `${age} лет`,
  'about-text-5': 'Я люблю сюжетные игры и фильмы, а также экспериментировать с креативными идеями. Развиваю свои навыки в веб-разработке, UI/UX и графическом дизайне, изучая новые техники и подходы.',
  'about-text-6': 'Если вас интересует качественный кастомный сайт с современным дизайном &mdash; обращайтесь.',

  'education-header': 'ОБРАЗОВАНИЕ',
  'education-text-1': 'Академия государственного управления при президенте Азербайджанской Республики',
  'education-text-2': 'Бакалавриат по экономике',
  'education-text-3': 'Сен 2022 &mdash; Июл 2026',

  'languages-header': 'ЯЗЫКИ',
  'languages-text-1': 'РУССКИЙ',
  'languages-text-2': 'АНГЛИЙСКИЙ',
  'languages-text-3': 'АЗЕРБАЙДЖАНСКИЙ',

  'web-header': 'ВЕБ',
  'personal-website': 'Личный сайт',
  'software-header': 'СОФТ',
  'graphics-header': 'ГРАФИКА',
  'personal-logo': 'Личный логотип',

  'overlay-back': '❮ Назад',
  'tooltip-code': 'Посмотреть код',
  'tooltip-copy': 'Скопировать ссылку',
  'overlay-files-header-s': 'ФАЙЛ',
  'overlay-files-header-p': 'ФАЙЛЫ',
  'overlay-images-header-s': 'ИЗОБРАЖЕНИЕ',
  'overlay-images-header-p': 'ИЗОБРАЖЕНИЯ',
  'overlay-video-header': 'ВИДЕО',
  'overlay-links-header-s': 'ССЫЛКА',
  'overlay-links-header-p': 'ССЫЛКИ',

  'personal-website-link-t': 'Вы уже здесь!',
  'personal-website-link-d': 'Но вот ссылка, если хотите…',

  'blasthack-link-t': 'Тема на BlastHack',
  'blasthack-link-d': 'Подробная тема на форуме, включающая: описание функций, требования, инструкции по установке, список изменений с историей версий и обсуждение сообщества с вопросами и ответами.',

  'personal-website-d': '<b>Описание:</b> Кастомное одностраничное приложение, разработанное на ванильном JavaScript, с реализацией роутинга, управления состоянием, форм и валидации. Полностью адаптивное с кастомным UI и UX для десктопа и тач-устройств. Включает современный дизайн, плавные анимации, галерею изображений и просмотр кода. Интегрирован ИИ-чат на базе GPT с сохранением контекста. Backend на Node.js с использованием SQLite для хранения необходимых данных, включая дневные лимиты GPT-токенов. Идентификация пользователей и управление лимитами без классической авторизации с использованием UID и отпечатков устройств. Обеспечивает функции безопасности и защиты использования.',
  'personal-website-date-d': '<b>Разработка:</b> 30 Авг 2025 &mdash; 2 Дек 2025',
  'personal-website-date-s': '<b>Поддержка:</b> В процессе',

  'custom-interface-d': '<b>Описание:</b> Улучшает интерфейс игры с настраиваемыми элементами HUD и виджетами, включает меню настроек в стиле Windows 10 и встроенное автообновление, всё на базе ImGui. Одно обновление было выпущено после релиза.',
  'custom-interface-date-d': '<b>Разработка:</b> 11 Окт 2020 &mdash; 29 Нов 2020',
  'custom-interface-date-s': '<b>Поддержка:</b> до Фев 2021',

  'vehicletools-d': '<b>Описание:</b> Предоставляет внутриигровые инструменты для продвинутого взаимодействия с транспортными средствами с настраиваемыми функциями, удобным интерфейсом и встроенной системой автообновления на базе ImGui. Включает 17 обновлений после релиза, из которых 5 добавляли новые функции.',
  'vehicletools-date-d': '<b>Разработка:</b> 8 Июн 2020 &mdash; 6 Июл 2020',
  'vehicletools-date-s': '<b>Поддержка:</b> до Дек 2020',

  'personal-logo-d': '<b>Описание:</b> Переплетённые буквы B и L, где вертикальная линия B соединяется с вертикальной линией L, которая слегка удлинена слева для визуального баланса. Концы букв плавно сужаются в мягкие, пероподобные точки, а общая округлая форма напоминает лодку с парусом. Справа расположена падающая звезда, отсылающая к предыдущим версиям логотипа и добавляющая композиционной гармонии.',
  'personal-logo-date': '<b>Дата:</b> 21 Сен 2025',

  'game-header': 'Игра:',

  'supported-lang-1': '<b>Поддерживаемые языки:</b> Английский, Русский',
  'supported-lang-2': '<b>Поддерживаемый язык:</b> Русский',

  'socials-header-1': 'КОНТАКТЫ',
  'socials-header-2': 'ПРОФСЕТИ',
  'socials-header-3': 'МЕДИА',
  'socials-header-4': 'РАЗВЛЕЧЕНИЯ'
};

document.querySelectorAll('[data-ru]').forEach(el => {
  el.dataset.en = el.innerHTML;
});

function updateTextLanguage(lang) {
  document.querySelectorAll('[data-ru]').forEach(el => {
    const key = el.dataset.ru;
    if (lang === 'ru') {
      el.innerHTML = translations[key] || el.innerHTML;
    } else {
      el.innerHTML = el.dataset.en;
    }
  });

  chatButtonTooltip.innerHTML = t(
    (isTouchDevice() ? 'Нажмите' : 'Кликните') + ' для чата с ИИ',
    (isTouchDevice() ? 'Tap' : 'Click') + ' to Chat with AI'
  );
  chatInput.placeholder = lang === 'ru' ? 'Введите сообщение...' : 'Type a message...';
  updateProjectDescriptions();
  getProjectCaptions();
}

function setActiveLanguage(lang, instant = false) {
  if (currentLang === lang) return;
  currentLang = lang;
  localStorage.setItem('lang', lang);

  updateTextLanguage(lang);

  languageSpanWidths();
  updateProjectTextWidths();
  applyOverlayLayout();
  updateOverlayTitle();

  clearTimeout(resetAnimationTimeout);

  langOptions.forEach(option => option.classList.remove('active'));
  const activeOption = document.querySelector(`.lang-option.${lang}`);
  if (!activeOption) return;

  activeOption.classList.add('active');

  if (instant) {
    langBg.style.left = (lang === 'en') ? '0%' : '50%';
    return;
  }

  langBg.style.transform = 'scale(1.1)';
  langBg.style.width = '55%';
  langBg.style.left = (lang === 'en') ? '0%' : '45%';

  resetAnimationTimeout = setTimeout(() => {
    langBg.style.transform = 'scale(1)';
    langBg.style.width = '50%';
    langBg.style.left = (lang === 'en') ? '0%' : '50%';
  }, 400);
}

const savedLang = localStorage.getItem('lang');
const browserLang = userLang.split('-')[0];

const initialLang = savedLang || (browserLang === 'ru' ? 'ru' : 'en');

setActiveLanguage(initialLang, true);

langOptions.forEach(option => {
  option.addEventListener('click', () => {
    const selectedLang = option.classList.contains('en') ? 'en' : 'ru';
    setActiveLanguage(selectedLang);
  });
});

function t(ruText, enText) {
  return currentLang === 'ru' ? ruText : enText;
}