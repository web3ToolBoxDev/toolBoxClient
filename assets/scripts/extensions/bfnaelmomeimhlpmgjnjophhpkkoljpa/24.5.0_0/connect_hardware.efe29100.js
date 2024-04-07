(function(define){var __define;"function"==typeof define&&define.amd&&(__define=define,define=null);
function e(e,t,r,n){Object.defineProperty(e,t,{get:r,set:n,enumerable:!0,configurable:!0})}function t(e){return e&&e.__esModule?e.default:e}var r="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{},n={},i={},a=r.parcelRequire1d24;null==a&&((a=function(e){if(e in n)return n[e].exports;if(e in i){var t=i[e];delete i[e];var r={id:e,exports:{}};return n[e]=r,t.call(r.exports,r,r.exports),r.exports}var a=new Error("Cannot find module '"+e+"'");throw a.code="MODULE_NOT_FOUND",a}).register=function(e,t){i[e]=t},r.parcelRequire1d24=a),a.register("kZlFr",(function(e,t){e.exports=Promise.all([a("22S8I")(new URL(a("5V6iE").resolve("9Dpy0"),import.meta.url).toString()),import("./"+a("5V6iE").resolve("1ueev")),import("./"+a("5V6iE").resolve("azrTG")),import("./"+a("5V6iE").resolve("7Yz5u"))]).then((()=>a("7CSQK")))})),a.register("22S8I",(function(e,t){var r=a("bDExm");e.exports=r((function(e){return new Promise((function(t,r){var n=document.getElementsByTagName("link");if([].concat(n).some((function(t){return t.href===e&&t.rel.indexOf("stylesheet")>-1})))t();else{var i=document.createElement("link");i.rel="stylesheet",i.href=e,i.onerror=function(e){i.onerror=i.onload=null,i.remove(),r(e)},i.onload=function(){i.onerror=i.onload=null,t()},document.getElementsByTagName("head")[0].appendChild(i)}}))}))})),a.register("bDExm",(function(e,t){var r={},n={},i={};e.exports=function(e,t){return function(a){var o=function(e){switch(e){case"preload":return n;case"prefetch":return i;default:return r}}(t);return o[a]?o[a]:o[a]=e.apply(null,arguments).catch((function(e){throw delete o[a],e}))}}})),a.register("tv9Be",(function(t,r){e(t.exports,"useInfiniteQuery",(function(){return l}));var n=a("bUcw9"),i=a("23gDC"),o=a("fMZKM");function l(e,t,r){const a=(0,i.parseQueryArgs)(e,t,r);return(0,o.useBaseQuery)(a,n.InfiniteQueryObserver)}})),a.register("bUcw9",(function(t,r){e(t.exports,"InfiniteQueryObserver",(function(){return o}));var n=a("f4Jbh"),i=a("8dVOS");class o extends n.QueryObserver{bindMethods(){super.bindMethods(),this.fetchNextPage=this.fetchNextPage.bind(this),this.fetchPreviousPage=this.fetchPreviousPage.bind(this)}setOptions(e,t){super.setOptions({...e,behavior:(0,i.infiniteQueryBehavior)()},t)}getOptimisticResult(e){return e.behavior=(0,i.infiniteQueryBehavior)(),super.getOptimisticResult(e)}fetchNextPage({pageParam:e,...t}={}){return this.fetch({...t,meta:{fetchMore:{direction:"forward",pageParam:e}}})}fetchPreviousPage({pageParam:e,...t}={}){return this.fetch({...t,meta:{fetchMore:{direction:"backward",pageParam:e}}})}createResult(e,t){var r,n,a,o,l,s;const{state:c}=e;return{...super.createResult(e,t),fetchNextPage:this.fetchNextPage,fetchPreviousPage:this.fetchPreviousPage,hasNextPage:(0,i.hasNextPage)(t,null==(r=c.data)?void 0:r.pages),hasPreviousPage:(0,i.hasPreviousPage)(t,null==(n=c.data)?void 0:n.pages),isFetchingNextPage:"fetching"===c.fetchStatus&&"forward"===(null==(a=c.fetchMeta)||null==(o=a.fetchMore)?void 0:o.direction),isFetchingPreviousPage:"fetching"===c.fetchStatus&&"backward"===(null==(l=c.fetchMeta)||null==(s=l.fetchMore)?void 0:s.direction)}}constructor(e,t){super(e,t)}}})),a.register("8dVOS",(function(t,r){function n(){return{onFetch:e=>{e.fetchFn=()=>{var t,r,n,o,l,s;const c=null==(t=e.fetchOptions)||null==(r=t.meta)?void 0:r.refetchPage,u=null==(n=e.fetchOptions)||null==(o=n.meta)?void 0:o.fetchMore,d=null==u?void 0:u.pageParam,f="forward"===(null==u?void 0:u.direction),g="backward"===(null==u?void 0:u.direction),h=(null==(l=e.state.data)?void 0:l.pages)||[],p=(null==(s=e.state.data)?void 0:s.pageParams)||[];let m=p,v=!1;const P=e.options.queryFn||(()=>Promise.reject("Missing queryFn")),y=(e,t,r,n)=>(m=n?[t,...m]:[...m,t],n?[r,...e]:[...e,r]),b=(t,r,n,i)=>{if(v)return Promise.reject("Cancelled");if(void 0===n&&!r&&t.length)return Promise.resolve(t);const a={queryKey:e.queryKey,pageParam:n,meta:e.meta};var o;o=a,Object.defineProperty(o,"signal",{enumerable:!0,get:()=>{var t,r;return null!=(t=e.signal)&&t.aborted?v=!0:null==(r=e.signal)||r.addEventListener("abort",(()=>{v=!0})),e.signal}});const l=P(a);return Promise.resolve(l).then((e=>y(t,n,e,i)))};let x;if(h.length)if(f){const t=void 0!==d,r=t?d:i(e.options,h);x=b(h,t,r)}else if(g){const t=void 0!==d,r=t?d:a(e.options,h);x=b(h,t,r,!0)}else{m=[];const t=void 0===e.options.getNextPageParam;x=!c||!h[0]||c(h[0],0,h)?b([],t,p[0]):Promise.resolve(y([],p[0],h[0]));for(let r=1;r<h.length;r++)x=x.then((n=>{if(!c||!h[r]||c(h[r],r,h)){const a=t?p[r]:i(e.options,n);return b(n,t,a)}return Promise.resolve(y(n,p[r],h[r]))}))}else x=b([]);return x.then((e=>({pages:e,pageParams:m})))}}}}function i(e,t){return null==e.getNextPageParam?void 0:e.getNextPageParam(t[t.length-1],t)}function a(e,t){return null==e.getPreviousPageParam?void 0:e.getPreviousPageParam(t[0],t)}function o(e,t){if(e.getNextPageParam&&Array.isArray(t)){const r=i(e,t);return null!=r&&!1!==r}}function l(e,t){if(e.getPreviousPageParam&&Array.isArray(t)){const r=a(e,t);return null!=r&&!1!==r}}e(t.exports,"infiniteQueryBehavior",(function(){return n})),e(t.exports,"hasNextPage",(function(){return o})),e(t.exports,"hasPreviousPage",(function(){return l}))})),a("5V6iE").register(JSON.parse('{"8iUX0":"connect_hardware.efe29100.js","7Yz5u":"ConnectHardwareMultichainFlow.f0a3e674.js","azrTG":"staking.037c2788.js","1ueev":"ConnectHardwareMultichainFlow.ad78d4a0.js","9Dpy0":"notification.5cbd182e.css","loP8i":"phishing.8cf80063.js","dIWgK":"metaplex.04cfb981.js","kJjdp":"metaplex.8ad40d27.js","7jMPF":"collectibles.4fd9b29c.js","amlOx":"swapper.c615a942.js","eBtTe":"connect_hardware.c9d6b878.js"}'));var o=a("lDSNw"),l=a("lz7nT"),s=a("cZIbv");a("1KK14");var c=a("4yY1D"),u=a("dU2RF"),d=a("kBpKb"),f=a("lMzyG"),g=(o=a("lDSNw"),a("NQvFB")),h=(s=a("cZIbv"),a("aanFI")),p=a("kn91D");const m=s.default.header`
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 30px 40px;
`,v=s.default.a`
  text-decoration: none;
  display: flex;
  align-items: center;
  transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
  transition-duration: 250ms;
  transition-property: color;
  color: #aaa;
  svg {
    fill: #222222;
    color: inherit;
    * {
      color: inherit;
    }
  }
  &:hover {
    opacity: 0.8;
  }
`,P=s.default.a`
  display: flex;
  color: #aaa;
  transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
  transition-duration: 250ms;
  transition-property: color;
  svg {
    fill: #222222;
    color: inherit;
    * {
      color: inherit;
    }
  }
  &:hover {
    opacity: 0.8;
  }
`;var y=a("5Doro"),b=a("a8kcR"),x=a("h5kyv"),w=a("8DCD7"),E=a("bLLpR"),O=a("bcqzL");const N=t(o).lazy((()=>a("kZlFr")));c.fileLogger.init({provider:E.ClientFileLoggerProvider}),c.telemetry.init(),c.telemetry.setUser({id:x.analytics.getDeviceId()}),(0,w.initializeFeatureFlags)();const F=document.getElementById("root");(0,u.createRoot)(F).render(t(o).createElement(l.BrowserRouter,null,t(o).createElement(s.ThemeProvider,{theme:b.theme},t(o).createElement(y.QueryProvider,null,t(o).createElement(O.ThemedGlobalStyle,{backgroundColor:"#E2DFFE"}),t(o).createElement((()=>{const{t:e}=(0,f.useTranslation)();return t(o).createElement(m,null,t(o).createElement(P,{href:g.PHANTOM_WEBSITE_URL,target:"_blank",rel:"noopener noreferrer"},t(o).createElement(h.IconPhantomLogo,{width:32})),t(o).createElement(v,{"data-testid":"full-page-header-support-link",href:g.PHANTOM_SUPPORT_URL,rel:"noopener",target:"_blank"},t(o).createElement(h.IconHelp,null),t(o).createElement(p.Text,{color:"#222222",size:16,weight:500,margin:"0 0 0 8px"},e("fullPageHeaderHelp"))))}),null),t(o).createElement(d.OnboardingAndConnectHardwareErrorBoundary,null,t(o).createElement(o.Suspense,{fallback:null},t(o).createElement(N,null))))))),x.analytics.capture("connectHardwareOpen");
//# sourceMappingURL=connect_hardware.efe29100.js.map
define=__define;})(window.define);