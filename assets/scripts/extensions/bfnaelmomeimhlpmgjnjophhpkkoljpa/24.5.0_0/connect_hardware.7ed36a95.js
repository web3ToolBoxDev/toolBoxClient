(function(define){var __define;"function"==typeof define&&define.amd&&(__define=define,define=null);
!function(){function e(e,t,n,r){Object.defineProperty(e,t,{get:n,set:r,enumerable:!0,configurable:!0})}function t(e){return e&&e.__esModule?e.default:e}var n="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{},r={},o={},i=n.parcelRequire1d24;null==i&&((i=function(e){if(e in r)return r[e].exports;if(e in o){var t=o[e];delete o[e];var n={id:e,exports:{}};return r[e]=n,t.call(n.exports,n,n.exports),n.exports}var i=new Error("Cannot find module '"+e+"'");throw i.code="MODULE_NOT_FOUND",i}).register=function(e,t){o[e]=t},n.parcelRequire1d24=i),i.register("93UPM",(function(e,t){e.exports=Promise.all([i("gx8Ji")(i("2FqAO").getBundleURL("gF3Ru")+i("eOkdY").resolve("9Dpy0")),i("j1yuj")(i("2FqAO").getBundleURL("gF3Ru")+i("eOkdY").resolve("eITPT")),i("j1yuj")(i("2FqAO").getBundleURL("gF3Ru")+i("eOkdY").resolve("a07i3")),i("j1yuj")(i("2FqAO").getBundleURL("gF3Ru")+i("eOkdY").resolve("96tJ1"))]).then((()=>i("3qeW6")))})),i.register("gx8Ji",(function(e,t){"use strict";var n=i("hE0rk");e.exports=n((function(e){return new Promise((function(t,n){var r=document.getElementsByTagName("link");if([].concat(r).some((function(t){return t.href===e&&t.rel.indexOf("stylesheet")>-1})))t();else{var o=document.createElement("link");o.rel="stylesheet",o.href=e,o.onerror=function(e){o.onerror=o.onload=null,o.remove(),n(e)},o.onload=function(){o.onerror=o.onload=null,t()},document.getElementsByTagName("head")[0].appendChild(o)}}))}))})),i.register("9CNaJ",(function(e,t){"use strict";var n=i("9MCQQ"),r={childContextTypes:!0,contextType:!0,contextTypes:!0,defaultProps:!0,displayName:!0,getDefaultProps:!0,getDerivedStateFromError:!0,getDerivedStateFromProps:!0,mixins:!0,propTypes:!0,type:!0},o={name:!0,length:!0,prototype:!0,caller:!0,callee:!0,arguments:!0,arity:!0},a={$$typeof:!0,compare:!0,defaultProps:!0,displayName:!0,propTypes:!0,type:!0},u={};function s(e){return n.isMemo(e)?a:u[e.$$typeof]||r}u[n.ForwardRef]={$$typeof:!0,render:!0,defaultProps:!0,displayName:!0,propTypes:!0},u[n.Memo]=a;var c=Object.defineProperty,l=Object.getOwnPropertyNames,f=Object.getOwnPropertySymbols,d=Object.getOwnPropertyDescriptor,p=Object.getPrototypeOf,m=Object.prototype;e.exports=function e(t,n,r){if("string"!=typeof n){if(m){var i=p(n);i&&i!==m&&e(t,i,r)}var a=l(n);f&&(a=a.concat(f(n)));for(var u=s(t),g=s(n),b=0;b<a.length;++b){var y=a[b];if(!(o[y]||r&&r[y]||g&&g[y]||u&&u[y])){var h=d(n,y);try{c(t,y,h)}catch(e){}}}}return t}})),i.register("9MCQQ",(function(e,t){"use strict";e.exports=i("dJlAX")})),i.register("dJlAX",(function(t,n){
/** @license React v16.13.1
 * react-is.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var r,o,i,a,u,s,c,l,f,d,p,m,g,b,y,h,v,P,x,w,k,O,S,M,j,E,$,T;e(t.exports,"AsyncMode",(function(){return r}),(function(e){return r=e})),e(t.exports,"ConcurrentMode",(function(){return o}),(function(e){return o=e})),e(t.exports,"ContextConsumer",(function(){return i}),(function(e){return i=e})),e(t.exports,"ContextProvider",(function(){return a}),(function(e){return a=e})),e(t.exports,"Element",(function(){return u}),(function(e){return u=e})),e(t.exports,"ForwardRef",(function(){return s}),(function(e){return s=e})),e(t.exports,"Fragment",(function(){return c}),(function(e){return c=e})),e(t.exports,"Lazy",(function(){return l}),(function(e){return l=e})),e(t.exports,"Memo",(function(){return f}),(function(e){return f=e})),e(t.exports,"Portal",(function(){return d}),(function(e){return d=e})),e(t.exports,"Profiler",(function(){return p}),(function(e){return p=e})),e(t.exports,"StrictMode",(function(){return m}),(function(e){return m=e})),e(t.exports,"Suspense",(function(){return g}),(function(e){return g=e})),e(t.exports,"isAsyncMode",(function(){return b}),(function(e){return b=e})),e(t.exports,"isConcurrentMode",(function(){return y}),(function(e){return y=e})),e(t.exports,"isContextConsumer",(function(){return h}),(function(e){return h=e})),e(t.exports,"isContextProvider",(function(){return v}),(function(e){return v=e})),e(t.exports,"isElement",(function(){return P}),(function(e){return P=e})),e(t.exports,"isForwardRef",(function(){return x}),(function(e){return x=e})),e(t.exports,"isFragment",(function(){return w}),(function(e){return w=e})),e(t.exports,"isLazy",(function(){return k}),(function(e){return k=e})),e(t.exports,"isMemo",(function(){return O}),(function(e){return O=e})),e(t.exports,"isPortal",(function(){return S}),(function(e){return S=e})),e(t.exports,"isProfiler",(function(){return M}),(function(e){return M=e})),e(t.exports,"isStrictMode",(function(){return j}),(function(e){return j=e})),e(t.exports,"isSuspense",(function(){return E}),(function(e){return E=e})),e(t.exports,"isValidElementType",(function(){return $}),(function(e){return $=e})),e(t.exports,"typeOf",(function(){return T}),(function(e){return T=e}));var F="function"==typeof Symbol&&Symbol.for,q=F?Symbol.for("react.element"):60103,R=F?Symbol.for("react.portal"):60106,N=F?Symbol.for("react.fragment"):60107,C=F?Symbol.for("react.strict_mode"):60108,A=F?Symbol.for("react.profiler"):60114,B=F?Symbol.for("react.provider"):60109,L=F?Symbol.for("react.context"):60110,_=F?Symbol.for("react.async_mode"):60111,Q=F?Symbol.for("react.concurrent_mode"):60111,z=F?Symbol.for("react.forward_ref"):60112,H=F?Symbol.for("react.suspense"):60113,D=F?Symbol.for("react.suspense_list"):60120,U=F?Symbol.for("react.memo"):60115,I=F?Symbol.for("react.lazy"):60116,J=F?Symbol.for("react.block"):60121,W=F?Symbol.for("react.fundamental"):60117,Y=F?Symbol.for("react.responder"):60118,K=F?Symbol.for("react.scope"):60119;function G(e){if("object"==typeof e&&null!==e){var t=e.$$typeof;switch(t){case q:switch(e=e.type){case _:case Q:case N:case A:case C:case H:return e;default:switch(e=e&&e.$$typeof){case L:case z:case I:case U:case B:return e;default:return t}}case R:return t}}}function V(e){return G(e)===Q}r=_,o=Q,i=L,a=B,u=q,s=z,c=N,l=I,f=U,d=R,p=A,m=C,g=H,b=function(e){return V(e)||G(e)===_},y=V,h=function(e){return G(e)===L},v=function(e){return G(e)===B},P=function(e){return"object"==typeof e&&null!==e&&e.$$typeof===q},x=function(e){return G(e)===z},w=function(e){return G(e)===N},k=function(e){return G(e)===I},O=function(e){return G(e)===U},S=function(e){return G(e)===R},M=function(e){return G(e)===A},j=function(e){return G(e)===C},E=function(e){return G(e)===H},$=function(e){return"string"==typeof e||"function"==typeof e||e===N||e===Q||e===A||e===C||e===H||e===D||"object"==typeof e&&null!==e&&(e.$$typeof===I||e.$$typeof===U||e.$$typeof===B||e.$$typeof===L||e.$$typeof===z||e.$$typeof===W||e.$$typeof===Y||e.$$typeof===K||e.$$typeof===J)},T=G})),i.register("wGjeD",(function(t,n){e(t.exports,"useInfiniteQuery",(function(){return u}));var r=i("6BSmi"),o=i("iKKzk"),a=i("dsciT");function u(e,t,n){const i=(0,o.parseQueryArgs)(e,t,n);return(0,a.useBaseQuery)(i,r.InfiniteQueryObserver)}})),i.register("6BSmi",(function(t,n){e(t.exports,"InfiniteQueryObserver",(function(){return a}));var r=i("3Pyfv"),o=i("cccYE");class a extends r.QueryObserver{bindMethods(){super.bindMethods(),this.fetchNextPage=this.fetchNextPage.bind(this),this.fetchPreviousPage=this.fetchPreviousPage.bind(this)}setOptions(e,t){super.setOptions({...e,behavior:(0,o.infiniteQueryBehavior)()},t)}getOptimisticResult(e){return e.behavior=(0,o.infiniteQueryBehavior)(),super.getOptimisticResult(e)}fetchNextPage({pageParam:e,...t}={}){return this.fetch({...t,meta:{fetchMore:{direction:"forward",pageParam:e}}})}fetchPreviousPage({pageParam:e,...t}={}){return this.fetch({...t,meta:{fetchMore:{direction:"backward",pageParam:e}}})}createResult(e,t){var n,r,i,a,u,s;const{state:c}=e;return{...super.createResult(e,t),fetchNextPage:this.fetchNextPage,fetchPreviousPage:this.fetchPreviousPage,hasNextPage:(0,o.hasNextPage)(t,null==(n=c.data)?void 0:n.pages),hasPreviousPage:(0,o.hasPreviousPage)(t,null==(r=c.data)?void 0:r.pages),isFetchingNextPage:"fetching"===c.fetchStatus&&"forward"===(null==(i=c.fetchMeta)||null==(a=i.fetchMore)?void 0:a.direction),isFetchingPreviousPage:"fetching"===c.fetchStatus&&"backward"===(null==(u=c.fetchMeta)||null==(s=u.fetchMore)?void 0:s.direction)}}constructor(e,t){super(e,t)}}})),i.register("cccYE",(function(t,n){function r(){return{onFetch:e=>{e.fetchFn=()=>{var t,n,r,a,u,s;const c=null==(t=e.fetchOptions)||null==(n=t.meta)?void 0:n.refetchPage,l=null==(r=e.fetchOptions)||null==(a=r.meta)?void 0:a.fetchMore,f=null==l?void 0:l.pageParam,d="forward"===(null==l?void 0:l.direction),p="backward"===(null==l?void 0:l.direction),m=(null==(u=e.state.data)?void 0:u.pages)||[],g=(null==(s=e.state.data)?void 0:s.pageParams)||[];let b=g,y=!1;const h=e.options.queryFn||(()=>Promise.reject("Missing queryFn")),v=(e,t,n,r)=>(b=r?[t,...b]:[...b,t],r?[n,...e]:[...e,n]),P=(t,n,r,o)=>{if(y)return Promise.reject("Cancelled");if(void 0===r&&!n&&t.length)return Promise.resolve(t);const i={queryKey:e.queryKey,pageParam:r,meta:e.meta};var a;a=i,Object.defineProperty(a,"signal",{enumerable:!0,get:()=>{var t,n;return null!=(t=e.signal)&&t.aborted?y=!0:null==(n=e.signal)||n.addEventListener("abort",(()=>{y=!0})),e.signal}});const u=h(i);return Promise.resolve(u).then((e=>v(t,r,e,o)))};let x;if(m.length)if(d){const t=void 0!==f,n=t?f:o(e.options,m);x=P(m,t,n)}else if(p){const t=void 0!==f,n=t?f:i(e.options,m);x=P(m,t,n,!0)}else{b=[];const t=void 0===e.options.getNextPageParam;x=!c||!m[0]||c(m[0],0,m)?P([],t,g[0]):Promise.resolve(v([],g[0],m[0]));for(let n=1;n<m.length;n++)x=x.then((r=>{if(!c||!m[n]||c(m[n],n,m)){const i=t?g[n]:o(e.options,r);return P(r,t,i)}return Promise.resolve(v(r,g[n],m[n]))}))}else x=P([]);return x.then((e=>({pages:e,pageParams:b})))}}}}function o(e,t){return null==e.getNextPageParam?void 0:e.getNextPageParam(t[t.length-1],t)}function i(e,t){return null==e.getPreviousPageParam?void 0:e.getPreviousPageParam(t[0],t)}function a(e,t){if(e.getNextPageParam&&Array.isArray(t)){const n=o(e,t);return null!=n&&!1!==n}}function u(e,t){if(e.getPreviousPageParam&&Array.isArray(t)){const n=i(e,t);return null!=n&&!1!==n}}e(t.exports,"infiniteQueryBehavior",(function(){return r})),e(t.exports,"hasNextPage",(function(){return a})),e(t.exports,"hasPreviousPage",(function(){return u}))})),i("eOkdY").register(JSON.parse('{"gF3Ru":"connect_hardware.7ed36a95.js","96tJ1":"ConnectHardwareMultichainFlow.727b05bc.js","a07i3":"staking.e599f575.js","eITPT":"ConnectHardwareMultichainFlow.0390354b.js","9Dpy0":"notification.5cbd182e.css","eI6Qi":"phishing.260d13e7.js","b0KbB":"metaplex.a7fe443c.js","8p21e":"metaplex.67571bb6.js","ulmHJ":"collectibles.f7823fac.js","fu8sn":"swapper.71addccc.js","84B8P":"multichainMigration.41f1b5a4.js"}'));var a=i("29o0l"),u=i("iQL9s"),s=i("gkfw3");i("8gulk");var c=i("csW2r"),l=i("3TM8f"),f=i("8Ub2g"),d=i("43063"),p=(a=i("29o0l"),i("9CoSy")),m=(s=i("gkfw3"),i("j81qC")),g=i("27SDj");const b=s.default.header`
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 30px 40px;
`,y=s.default.a`
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
`,h=s.default.a`
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
`;var v=i("41yT6"),P=i("4K7Du"),x=i("twk6W"),w=i("dNPkM"),k=i("17H3T"),O=i("2jR04"),S=(s=i("gkfw3"),{});e(S,"reset",(function(){return $}),(function(e){return $=e})),e(S,"Reset",(function(){return T}),(function(e){return T=e})),e(S,"default",(function(){return F}),(function(e){return F=e}));var M,j,E=function(e,t){return Object.defineProperty?Object.defineProperty(e,"raw",{value:t}):e.raw=t,e},$=(0,(s=i("gkfw3")).css)(M||(M=E(["\n/* http://meyerweb.com/eric/tools/css/reset/\n   v5.0.1 | 20191019\n   License: none (public domain)\n*/\n\nhtml, body, div, span, applet, object, iframe,\nh1, h2, h3, h4, h5, h6, p, blockquote, pre,\na, abbr, acronym, address, big, cite, code,\ndel, dfn, em, img, ins, kbd, q, s, samp,\nsmall, strike, strong, sub, sup, tt, var,\nb, u, i, center,\ndl, dt, dd, menu, ol, ul, li,\nfieldset, form, label, legend,\ntable, caption, tbody, tfoot, thead, tr, th, td,\narticle, aside, canvas, details, embed,\nfigure, figcaption, footer, header, hgroup,\nmain, menu, nav, output, ruby, section, summary,\ntime, mark, audio, video {\n  margin: 0;\n  padding: 0;\n  border: 0;\n  font-size: 100%;\n  font: inherit;\n  vertical-align: baseline;\n}\n/* HTML5 display-role reset for older browsers */\narticle, aside, details, figcaption, figure,\nfooter, header, hgroup, main, menu, nav, section {\n  display: block;\n}\n/* HTML5 hidden-attribute fix for newer browsers */\n*[hidden] {\n    display: none;\n}\nbody {\n  line-height: 1;\n}\nmenu, ol, ul {\n  list-style: none;\n}\nblockquote, q {\n  quotes: none;\n}\nblockquote:before, blockquote:after,\nq:before, q:after {\n  content: '';\n  content: none;\n}\ntable {\n  border-collapse: collapse;\n  border-spacing: 0;\n}\n"],["\n/* http://meyerweb.com/eric/tools/css/reset/\n   v5.0.1 | 20191019\n   License: none (public domain)\n*/\n\nhtml, body, div, span, applet, object, iframe,\nh1, h2, h3, h4, h5, h6, p, blockquote, pre,\na, abbr, acronym, address, big, cite, code,\ndel, dfn, em, img, ins, kbd, q, s, samp,\nsmall, strike, strong, sub, sup, tt, var,\nb, u, i, center,\ndl, dt, dd, menu, ol, ul, li,\nfieldset, form, label, legend,\ntable, caption, tbody, tfoot, thead, tr, th, td,\narticle, aside, canvas, details, embed,\nfigure, figcaption, footer, header, hgroup,\nmain, menu, nav, output, ruby, section, summary,\ntime, mark, audio, video {\n  margin: 0;\n  padding: 0;\n  border: 0;\n  font-size: 100%;\n  font: inherit;\n  vertical-align: baseline;\n}\n/* HTML5 display-role reset for older browsers */\narticle, aside, details, figcaption, figure,\nfooter, header, hgroup, main, menu, nav, section {\n  display: block;\n}\n/* HTML5 hidden-attribute fix for newer browsers */\n*[hidden] {\n    display: none;\n}\nbody {\n  line-height: 1;\n}\nmenu, ol, ul {\n  list-style: none;\n}\nblockquote, q {\n  quotes: none;\n}\nblockquote:before, blockquote:after,\nq:before, q:after {\n  content: '';\n  content: none;\n}\ntable {\n  border-collapse: collapse;\n  border-spacing: 0;\n}\n"]))),T=(0,s.createGlobalStyle)(j||(j=E(["",""],["",""])),$),F=$,q=i("c8OXT");const R=s.css`
  ::-webkit-scrollbar {
    background: #222;
    width: 7px;
  }

  ::-webkit-scrollbar-thumb {
    background: #2a2a2a;
    border-radius: 8px;
  }
`,N=s.css`
  ::-webkit-scrollbar {
    display: none;
  }
  * {
    scrollbar-width: none; /* Also needed to disable scrollbar Firefox */
  }
`,C=s.createGlobalStyle`
    ${S.default}

    body, html, * {
        box-sizing: border-box;
        font-family: 'Inter', 'Roboto', Arial;
        user-select: none;
        color: currentColor;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeSpeed;
        -webkit-font-smoothing: antialiased;
    }
    input, textarea {
        -webkit-user-select: text;
        -khtml-user-select: text;
        -moz-user-select: text;
        -ms-user-select: text;
        user-select: text;
    }
    body {
        color: white;
        background: ${e=>e.backgroundColor};
        min-height: 100vh;
        margin: 0;
        display: flex;
        justify-content: center;
        align-items: center;
    }
    *:focus, *:focus-within {
        outline-color: transparent !important;
        outline-style: none !important;
        outline-width: 0px !important;
    }

    ${q.BROWSER_ENV.os.name===O.OS_MAP.MacOS||q.BROWSER_ENV.os.name===O.OS_MAP.Windows?N:R}
`,A=t(a).lazy((()=>i("93UPM")));c.fileLogger.init({provider:k.ClientFileLoggerProvider}),c.telemetry.init(),c.telemetry.setUser({id:x.analytics.getDeviceId()}),(0,w.initializeFeatureFlags)();const B=document.getElementById("root");(0,l.createRoot)(B).render(t(a).createElement(u.BrowserRouter,null,t(a).createElement(s.ThemeProvider,{theme:P.theme},t(a).createElement(v.QueryProvider,null,t(a).createElement(C,{backgroundColor:"#E2DFFE"}),t(a).createElement((()=>{const{t:e}=(0,d.useTranslation)();return t(a).createElement(b,null,t(a).createElement(h,{href:p.PHANTOM_WEBSITE_URL,target:"_blank",rel:"noopener noreferrer"},t(a).createElement(m.IconPhantomLogo,{width:32})),t(a).createElement(y,{"data-testid":"full-page-header-support-link",href:p.PHANTOM_SUPPORT_URL,rel:"noopener",target:"_blank"},t(a).createElement(m.IconHelp,null),t(a).createElement(g.Text,{color:"#222222",size:16,weight:500,margin:"0 0 0 8px"},e("fullPageHeaderHelp"))))}),null),t(a).createElement(f.OnboardingAndConnectHardwareErrorBoundary,null,t(a).createElement(a.Suspense,{fallback:null},t(a).createElement(A,null))))))),x.analytics.capture("connectHardwareOpen")}();
//# sourceMappingURL=connect_hardware.7ed36a95.js.map
define=__define;})(window.define);