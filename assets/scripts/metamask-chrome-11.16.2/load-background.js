// eslint-disable-next-line import/unambiguous
'use strict';

setTimeout(() => {
  // eslint-disable-next-line spaced-comment
  const scriptsToLoad = [
    ...["./scripts/snow.js","./scripts/use-snow.js","./scripts/sentry-install.js","./scripts/runtime-lavamoat.js","./scripts/lockdown-more.js","./scripts/policy-load.js","./common-0.js","./common-1.js","./common-2.js","./common-3.js","./common-4.js","./common-5.js","./common-6.js","./common-7.js","./common-8.js","./background-0.js","./background-1.js","./background-2.js","./background-3.js","./background-4.js","./background-5.js","./background-6.js"]
  ];

  const loadScript = (src) => {
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.onload = loadNext;
    script.src = src;
    document.body.appendChild(script);
  };

  loadNext();

  function loadNext() {
    if (scriptsToLoad.length) {
      loadScript(scriptsToLoad.shift());
    } else {
      document.documentElement.classList.add('metamask-loaded');
    }
  }
}, 10);
