(function(define){var __define;"function"==typeof define&&define.amd&&(__define=define,define=null);
!function(){function e(e,t,n,r){Object.defineProperty(e,t,{get:n,set:r,enumerable:!0,configurable:!0})}function t(e){return e&&e.__esModule?e.default:e}var n="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{},r={},o={},a=n.parcelRequire1d24;null==a&&((a=function(e){if(e in r)return r[e].exports;if(e in o){var t=o[e];delete o[e];var n={id:e,exports:{}};return r[e]=n,t.call(n.exports,n,n.exports),n.exports}var a=new Error("Cannot find module '"+e+"'");throw a.code="MODULE_NOT_FOUND",a}).register=function(e,t){o[e]=t},n.parcelRequire1d24=a),a.register("eOkdY",(function(t,n){var r,o;e(t.exports,"register",(function(){return r}),(function(e){return r=e})),e(t.exports,"resolve",(function(){return o}),(function(e){return o=e}));var a={};r=function(e){for(var t=Object.keys(e),n=0;n<t.length;n++)a[t[n]]=e[t[n]]},o=function(e){var t=a[e];if(null==t)throw new Error("Could not resolve bundle with id "+e);return t}})),a.register("cI6uH",(function(t,n){e(t.exports,"useEffectOnce",(function(){return o}));var r=a("29o0l");const o=(e,t)=>{const n=(0,r.useRef)(!1);(0,r.useEffect)((()=>{if(!n.current&&t)return n.current=!0,e()}))}})),a.register("3w1Ia",(function(t,n){e(t.exports,"default",(function(){return o}));var r=a("29o0l");function o(e){var t=(0,r.useRef)();return(0,r.useEffect)((function(){t.current=e})),t.current}})),a.register("hH9iQ",(function(e,t){e.exports=a("j1yuj")(a("2FqAO").getBundleURL("aNQ1Y")+a("eOkdY").resolve("4EtWZ")).then((()=>a("izxKn")))})),a.register("j1yuj",(function(e,t){"use strict";var n=a("hE0rk");e.exports=n((function(e){return new Promise((function(t,n){var r=document.getElementsByTagName("script");if([].concat(r).some((function(t){return t.src===e})))t();else{var o=document.createElement("link");o.href=e,o.rel="preload",o.as="script",document.head.appendChild(o);var a=document.createElement("script");a.async=!0,a.type="text/javascript",a.src=e,a.onerror=function(t){var r=new TypeError("Failed to fetch dynamically imported module: ".concat(e,". Error: ").concat(t.message));a.onerror=a.onload=null,a.remove(),n(r)},a.onload=function(){a.onerror=a.onload=null,t()},document.getElementsByTagName("head")[0].appendChild(a)}}))}))})),a.register("hE0rk",(function(e,t){"use strict";var n={},r={},o={};e.exports=function(e,t){return function(a){var i=function(e){switch(e){case"preload":return r;case"prefetch":return o;default:return n}}(t);return i[a]?i[a]:i[a]=e.apply(null,arguments).catch((function(e){throw delete i[a],e}))}}})),a.register("2FqAO",(function(t,n){var r;e(t.exports,"getBundleURL",(function(){return r}),(function(e){return r=e}));var o={};function a(e){return(""+e).replace(/^((?:https?|file|ftp|(chrome|moz|safari-web)-extension):\/\/.+)\/[^/]+$/,"$1")+"/"}r=function(e){var t=o[e];return t||(t=function(){try{throw new Error}catch(t){var e=(""+t.stack).match(/(https?|file|ftp|(chrome|moz|safari-web)-extension):\/\/[^)\n]+/g);if(e)return a(e[2])}return"/"}(),o[e]=t),t}})),a.register("a9fRR",(function(e,t){e.exports=a("j1yuj")(a("2FqAO").getBundleURL("aNQ1Y")+a("eOkdY").resolve("1LD6V")).then((()=>a("aEspS")))})),a.register("43ULJ",(function(e,t){e.exports=a("j1yuj")(a("2FqAO").getBundleURL("aNQ1Y")+a("eOkdY").resolve("a65FD")).then((()=>a("1fvbV")))})),a.register("iOeB3",(function(e,t){e.exports=a("j1yuj")(a("2FqAO").getBundleURL("aNQ1Y")+a("eOkdY").resolve("6rb19")).then((()=>a("hxNzQ")))})),a.register("fwBWQ",(function(e,t){e.exports=a("j1yuj")(a("2FqAO").getBundleURL("aNQ1Y")+a("eOkdY").resolve("4teYO")).then((()=>a("lXzah")))})),a.register("3spqi",(function(e,t){e.exports=a("j1yuj")(a("2FqAO").getBundleURL("aNQ1Y")+a("eOkdY").resolve("2e7QY")).then((()=>a("iI3S3")))})),a.register("9CNaJ",(function(e,t){"use strict";var n=a("9MCQQ"),r={childContextTypes:!0,contextType:!0,contextTypes:!0,defaultProps:!0,displayName:!0,getDefaultProps:!0,getDerivedStateFromError:!0,getDerivedStateFromProps:!0,mixins:!0,propTypes:!0,type:!0},o={name:!0,length:!0,prototype:!0,caller:!0,callee:!0,arguments:!0,arity:!0},i={$$typeof:!0,compare:!0,defaultProps:!0,displayName:!0,propTypes:!0,type:!0},l={};function c(e){return n.isMemo(e)?i:l[e.$$typeof]||r}l[n.ForwardRef]={$$typeof:!0,render:!0,defaultProps:!0,displayName:!0,propTypes:!0},l[n.Memo]=i;var s=Object.defineProperty,u=Object.getOwnPropertyNames,d=Object.getOwnPropertySymbols,f=Object.getOwnPropertyDescriptor,m=Object.getPrototypeOf,p=Object.prototype;e.exports=function e(t,n,r){if("string"!=typeof n){if(p){var a=m(n);a&&a!==p&&e(t,a,r)}var i=u(n);d&&(i=i.concat(d(n)));for(var l=c(t),g=c(n),h=0;h<i.length;++h){var y=i[h];if(!(o[y]||r&&r[y]||g&&g[y]||l&&l[y])){var b=f(n,y);try{s(t,y,b)}catch(e){}}}}return t}})),a.register("9MCQQ",(function(e,t){"use strict";e.exports=a("dJlAX")})),a.register("dJlAX",(function(t,n){
/** @license React v16.13.1
 * react-is.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var r,o,a,i,l,c,s,u,d,f,m,p,g,h,y,b,x,v,w,E,k,C,O,T,S,F,M,A;e(t.exports,"AsyncMode",(function(){return r}),(function(e){return r=e})),e(t.exports,"ConcurrentMode",(function(){return o}),(function(e){return o=e})),e(t.exports,"ContextConsumer",(function(){return a}),(function(e){return a=e})),e(t.exports,"ContextProvider",(function(){return i}),(function(e){return i=e})),e(t.exports,"Element",(function(){return l}),(function(e){return l=e})),e(t.exports,"ForwardRef",(function(){return c}),(function(e){return c=e})),e(t.exports,"Fragment",(function(){return s}),(function(e){return s=e})),e(t.exports,"Lazy",(function(){return u}),(function(e){return u=e})),e(t.exports,"Memo",(function(){return d}),(function(e){return d=e})),e(t.exports,"Portal",(function(){return f}),(function(e){return f=e})),e(t.exports,"Profiler",(function(){return m}),(function(e){return m=e})),e(t.exports,"StrictMode",(function(){return p}),(function(e){return p=e})),e(t.exports,"Suspense",(function(){return g}),(function(e){return g=e})),e(t.exports,"isAsyncMode",(function(){return h}),(function(e){return h=e})),e(t.exports,"isConcurrentMode",(function(){return y}),(function(e){return y=e})),e(t.exports,"isContextConsumer",(function(){return b}),(function(e){return b=e})),e(t.exports,"isContextProvider",(function(){return x}),(function(e){return x=e})),e(t.exports,"isElement",(function(){return v}),(function(e){return v=e})),e(t.exports,"isForwardRef",(function(){return w}),(function(e){return w=e})),e(t.exports,"isFragment",(function(){return E}),(function(e){return E=e})),e(t.exports,"isLazy",(function(){return k}),(function(e){return k=e})),e(t.exports,"isMemo",(function(){return C}),(function(e){return C=e})),e(t.exports,"isPortal",(function(){return O}),(function(e){return O=e})),e(t.exports,"isProfiler",(function(){return T}),(function(e){return T=e})),e(t.exports,"isStrictMode",(function(){return S}),(function(e){return S=e})),e(t.exports,"isSuspense",(function(){return F}),(function(e){return F=e})),e(t.exports,"isValidElementType",(function(){return M}),(function(e){return M=e})),e(t.exports,"typeOf",(function(){return A}),(function(e){return A=e}));var j="function"==typeof Symbol&&Symbol.for,B=j?Symbol.for("react.element"):60103,R=j?Symbol.for("react.portal"):60106,P=j?Symbol.for("react.fragment"):60107,$=j?Symbol.for("react.strict_mode"):60108,N=j?Symbol.for("react.profiler"):60114,L=j?Symbol.for("react.provider"):60109,I=j?Symbol.for("react.context"):60110,z=j?Symbol.for("react.async_mode"):60111,q=j?Symbol.for("react.concurrent_mode"):60111,D=j?Symbol.for("react.forward_ref"):60112,W=j?Symbol.for("react.suspense"):60113,H=j?Symbol.for("react.suspense_list"):60120,Q=j?Symbol.for("react.memo"):60115,V=j?Symbol.for("react.lazy"):60116,Y=j?Symbol.for("react.block"):60121,_=j?Symbol.for("react.fundamental"):60117,G=j?Symbol.for("react.responder"):60118,U=j?Symbol.for("react.scope"):60119;function J(e){if("object"==typeof e&&null!==e){var t=e.$$typeof;switch(t){case B:switch(e=e.type){case z:case q:case P:case N:case $:case W:return e;default:switch(e=e&&e.$$typeof){case I:case D:case V:case Q:case L:return e;default:return t}}case R:return t}}}function K(e){return J(e)===q}r=z,o=q,a=I,i=L,l=B,c=D,s=P,u=V,d=Q,f=R,m=N,p=$,g=W,h=function(e){return K(e)||J(e)===z},y=K,b=function(e){return J(e)===I},x=function(e){return J(e)===L},v=function(e){return"object"==typeof e&&null!==e&&e.$$typeof===B},w=function(e){return J(e)===D},E=function(e){return J(e)===P},k=function(e){return J(e)===V},C=function(e){return J(e)===Q},O=function(e){return J(e)===R},T=function(e){return J(e)===N},S=function(e){return J(e)===$},F=function(e){return J(e)===W},M=function(e){return"string"==typeof e||"function"==typeof e||e===P||e===q||e===N||e===$||e===W||e===H||"object"==typeof e&&null!==e&&(e.$$typeof===V||e.$$typeof===Q||e.$$typeof===L||e.$$typeof===I||e.$$typeof===D||e.$$typeof===_||e.$$typeof===G||e.$$typeof===U||e.$$typeof===Y)},A=J})),a.register("cb8KS",(function(n,r){e(n.exports,"ConfirmationIconType",(function(){return p})),e(n.exports,"ConfirmationIcon",(function(){return h}));var o=a("1fwzV"),i=a("lz5BI"),l=a("29o0l"),c=a("gkfw3"),s=a("6UMd8"),u=a("j81qC");const d=c.default.div`
  position: relative;
`,f=(0,c.default)(i.motion.div)`
  width: ${e=>e.width}px;
  height: ${e=>e.width}px;
`,m=(0,c.default)(i.motion.div)`
  top: 0;
  width: 100%;
  height: 100%;
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
`;var p,g;(g=p||(p={})).Default="default",g.Warning="warning",g.Failure="failure",g.Success="success";const h=({type:e,iconWidth:n,defaultIcon:r,backgroundWidth:a=94})=>t(l).createElement(d,null,t(l).createElement(o.AnimatePresence,{mode:"wait",initial:!1},t(l).createElement(f,{width:a,key:e,initial:{opacity:0},animate:{opacity:1},exit:{opacity:0},transition:{duration:.2}},(()=>{switch(e){case p.Default:return t(l).createElement(s.Circle,{diameter:a,color:"#181818",includeDarkBoxShadow:!0});case p.Warning:return t(l).createElement(s.Circle,{diameter:a,color:"#FFDC62",opacity:.1});case p.Failure:return t(l).createElement(s.Circle,{diameter:a,color:"#EB3742",opacity:.1});case p.Success:return t(l).createElement(s.Circle,{diameter:a,color:"#21E56F",opacity:.1})}})())),t(l).createElement(o.AnimatePresence,{mode:"wait",initial:!0},t(l).createElement(m,{key:e,initial:{opacity:0,y:10},animate:{opacity:1,y:0},exit:{opacity:0,y:10},transition:{duration:.4,bounce:.4,type:"spring"}},(()=>{switch(e){case p.Default:return null!=r?r:t(l).createElement(u.IconQuestionMark,{width:null!=n?n:30});case p.Warning:return t(l).createElement(u.IconExclamationMarkCircle,{width:40,height:40,circleFill:"#FFDC62",exclamationFill:"#00000000"});case p.Failure:return t(l).createElement(u.IconFailure,{width:null!=n?n:30});case p.Success:return t(l).createElement(u.IconCheckmark,{height:"100%",width:null!=n?n:40,fill:"#21E56F"})}})())))})),a.register("3mrWC",(function(n,r){e(n.exports,"IconHeaderStyle",(function(){return h})),e(n.exports,"IconHeader",(function(){return w}));var o=a("29o0l"),i=a("gkfw3"),l=a("91Dw6"),c=a("j81qC"),s=a("27SDj");const u=i.default.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`,d=i.keyframes`
  0% {
    top: 15px;
    opacity: 0;
  };
  100% {
    top: 0px;
    opacity: 1;
  };
`,f=i.default.div`
  animation-name: ${e=>e.animateText?d:"none"};
  animation-duration: ${e=>e.animateText?".5s":"0s"};
  position: relative;
`,m=(0,i.default)(s.Text)`
  margin: ${e=>e.margin};
`;m.defaultProps={margin:"20px auto 0 auto"};const p=(0,i.default)(s.Text)`
  margin: ${e=>e.margin};
`;p.defaultProps={margin:"15px 0px 0px 0px"};const g=i.default.div`
  position: relative;
  left: 38px;
  bottom: 22px;
`;var h,y;(y=h||(h={})).Medium="medium",y.Large="large",y.Small="small";const b={[h.Large]:30,[h.Medium]:28,[h.Small]:24},x={[h.Large]:34,[h.Medium]:34,[h.Small]:29},v={[h.Large]:18,[h.Medium]:16,[h.Small]:14},w=({className:e,icon:n,primaryText:r,secondaryText:a,headerStyle:i,showWarning:s=!1,showError:d=!1,animateText:y=!1})=>{i=null!=i?i:h.Medium;const w=b[i],E=x[i],k=v[i],C={[h.Large]:22,[h.Medium]:19,[h.Small]:17}[i],O="small"===i?"16px 0 0 0":void 0,T=d?l.ERROR_COLOR:"#777777";return t(o).createElement(u,{className:e},null!=n?n:t(o).createElement(c.IconUnknownOrigin,null),s?t(o).createElement(g,null,t(o).createElement(c.IconExclamationMarkCircle,null)):t(o).createElement(t(o).Fragment,null),t(o).createElement(f,{animateText:y},r&&t(o).createElement(m,{margin:O,weight:500,size:w,lineHeight:E,maxWidth:"320px"},r),a&&t(o).createElement(p,{margin:O,wordBreak:"break-word",size:k,lineHeight:C,color:T},a)))};w.defaultProps={headerStyle:h.Medium}})),a.register("91Dw6",(function(t,n){e(t.exports,"WARNING_COLOR",(function(){return r})),e(t.exports,"DANGER_COLOR",(function(){return o})),e(t.exports,"ERROR_COLOR",(function(){return a}));const r="#FFDC62",o="#EB3742",a="#eb3742"})),a.register("bw7Ah",(function(n,r){e(n.exports,"PTrans",(function(){return s}),(function(e){return s=e}));var o=a("43063"),i=a("29o0l"),l=a("8Ub2g"),c=function(e,t){var n={};for(var r in e)Object.prototype.hasOwnProperty.call(e,r)&&t.indexOf(r)<0&&(n[r]=e[r]);if(null!=e&&"function"==typeof Object.getOwnPropertySymbols){var o=0;for(r=Object.getOwnPropertySymbols(e);o<r.length;o++)t.indexOf(r[o])<0&&Object.prototype.propertyIsEnumerable.call(e,r[o])&&(n[r[o]]=e[r[o]])}return n};const s=t(i).memo((e=>{const{children:n,i18nKey:r}=e,a=c(e,["children","i18nKey"]),{t:s}=(0,o.useTranslation)(),u=(0,i.useMemo)((()=>(r?`${s(r,Object.assign(Object.assign({},a),a.values))}`:"").replace(/<\/?[^>]+(>|$)/g,"")),[r,a,s]);return t(i).createElement(l.ErrorBoundary,{fallback:u},t(i).createElement(o.Trans,Object.assign({i18nKey:r},a),n))}))})),a("eOkdY").register(JSON.parse('{"aNQ1Y":"popup.4aed6b21.js","4EtWZ":"HomeTabPage.461b9d42.js","1LD6V":"CollectionsPage.ecb976b5.js","a65FD":"SwapTabPage.87a070f1.js","6rb19":"RecentActivity.23a9f43d.js","4teYO":"ExplorePage.48913488.js","2e7QY":"SwapSettingsButton.6a1f394d.js","9Dpy0":"notification.5cbd182e.css","eI6Qi":"phishing.260d13e7.js","b0KbB":"metaplex.a7fe443c.js","8p21e":"metaplex.67571bb6.js","ulmHJ":"collectibles.f7823fac.js","a07i3":"staking.e599f575.js","fu8sn":"swapper.71addccc.js","auvQI":"notification.b4bb12ea.js","eITPT":"ConnectHardwareMultichainFlow.0390354b.js","84B8P":"multichainMigration.41f1b5a4.js","lbp5w":"onboarding.e6d78f0d.js"}'));var i=a("29o0l"),l=a("3TM8f"),c=a("ljwNC");a("8gulk");var s,u,d=a("csW2r"),f=a("7gANb"),m=a("9yJOd"),p=a("gkfw3"),g=a("8Ub2g"),h=a("e3YvV"),y=a("gYT35"),b=a("3ljHn"),x=a("43063"),v=(i=a("29o0l"),a("iQL9s")),w=(a("ljwNC"),a("c8OXT")),E=a("brWcm"),k=a("gX5Te"),C=a("cI6uH"),O=a("9aR5q"),T=a("lznD3"),S=a("twk6W"),F=a("gcdBN"),M=(x=a("43063"),a("RVqnc")),A=a("1fwzV"),j=a("lz5BI"),B=(i=a("29o0l"),p=a("gkfw3"),i=a("29o0l"),a("creZv"));(u=s||(s={})).NetworkHealth="network-health",u.Cluster="cluster",u.TestnetMode="testnet-mode";const R=(0,i.createContext)(null),P=()=>{const e=(0,i.useContext)(R);if(!e)throw new Error("Missing banner context. Make sure you're wrapping your component in a <BannerProvider />");return e},$=({children:e})=>{const n=[],[r,o]=(0,i.useReducer)(((e,t)=>{switch(t.type){case"create":return e.concat(t.payload);case"delete":return e.filter((({id:e})=>e!==t.payload.id));case"reset":return n;default:throw new Error("There was an error dispatching a banner action.")}}),n),a=e=>o({type:"delete",payload:{id:e.id}});return t(i).createElement(R.Provider,{value:{banners:r,createBanner:e=>{const{type:t,variant:n,message:r,dismissable:i=!0,icon:l,autohide:c=!0,delay:s=5e3,onClick:u}=e;t&&n&&r||console.error("You must supply a type, variant and message when creating a Banner.");const d=(0,B.default)();return o({type:"create",payload:{id:d,type:t,variant:n,message:r,dismissable:i,icon:l,autohide:c,delay:s,onClick:u}}),c&&setTimeout((()=>{a({id:d})}),s),d},deleteBanner:a,resetBanners:()=>o({type:"reset"})}},e)};var N=a("jOE8F"),L=(k=a("gX5Te"),a("feAoQ")),I=a("dIAes"),z=a("60vo7"),q=a("j81qC");const D=p.default.button`
  cursor: ${e=>e.onClick?"pointer":"default"};
  display: flex;
  align-items: center;
  vertical-align: middle;
  overflow: visible;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  border-width: 1px;
  border-style: solid;
  border-color: transparent;
  background-color: transparent;
  width: 100%;
  padding: 10px 16px;

  svg {
    fill: #fff;
    margin-right: 8px;
  }
`,W=(0,p.default)(j.motion.div)`
  position: relative;
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: ${e=>{switch(e.variant){case z.CTAVariant.Primary:return(0,M.hexToRGB)("#AB9FF2",.7);case z.CTAVariant.Success:return(0,M.hexToRGB)("#21E56F",.7);case z.CTAVariant.Warning:return(0,M.hexToRGB)("#E5A221",.7);case z.CTAVariant.Danger:return(0,M.hexToRGB)("#EB3742",.7);default:return(0,M.hexToRGB)("#E5A221",.7)}}};

  ${D} {
    &:focus-visible {
      border-color: ${e=>{switch(e.variant){case z.CTAVariant.Primary:return(0,M.hexToRGB)("#AB9FF2",.7);case z.CTAVariant.Success:return(0,M.hexToRGB)("#21E56F",.7);case z.CTAVariant.Warning:return(0,M.hexToRGB)("#E5A221",.7);case z.CTAVariant.Danger:return(0,M.hexToRGB)("#EB3742",.7);default:return(0,M.hexToRGB)("#E5A221",.7)}}};
    }
  }
`,H=p.default.p`
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  line-height: 19px;
  text-align: left;

  svg {
    margin-right: 10px;
  }
`,Q=p.default.button`
  cursor: pointer;
  position: absolute;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  margin: 0;
  padding: 0;
  overflow: visible;
  -webkit-user-select: none;
  -moz-user-select: none;
  user-select: none;
  border-width: 1px;
  border-style: solid;
  border-color: transparent;
  background-color: transparent;

  &:focus,
  &:focus-visible {
    border-color: ${(0,M.hexToRGB)("#FFFFFF",.3)};
  }

  svg {
    fill: #ffffff;
    margin: 0;
  }
`,V=(e,n,r)=>{const{banners:o,createBanner:a,deleteBanner:l}=P(),c=o[o.length-1],{handleShowModalVisibility:u}=(0,L.useModals)(),{showSettingsMenu:d}=(0,N.useSettingsMenu)(),{t:f,i18n:m}=(0,x.useTranslation)(),{cluster:p}=e(),g=k.hooks.useNetworkHealth(m.language).data,h=n(),y=r();(0,i.useEffect)((()=>{const e=o.find((e=>e.type===s.TestnetMode));e&&l({id:e.id}),y?a({type:s.TestnetMode,variant:z.CTAVariant.Warning,message:f("featureNotSupportedOnLocalNet"),dismissable:!1,autohide:!1,onClick:()=>d(void 0,t(i).createElement(I.MultiChainDeveloperSettings,null))}):h&&a({type:s.TestnetMode,variant:z.CTAVariant.Warning,message:f("connectionClusterTestnetMode"),dismissable:!1,autohide:!1,onClick:()=>d(void 0,t(i).createElement(I.MultiChainDeveloperSettings,null))})}),[y,h,f]),(0,i.useEffect)((()=>{if(!p)return;const e=o.find((e=>e.type===s.NetworkHealth));if("mainnet-beta"===p){if(g){const{bannerVariant:n,bannerMessage:r,notificationMessageTitle:o,notificationMessage:c}=g;!!n&&!!r?r!==(null==e?void 0:e.message)&&a({type:s.NetworkHealth,variant:n,message:r,dismissable:!1,icon:t(i).createElement(q.IconExclamationMarkCircle,{width:14,height:14,circleFill:"#FFFFFF",exclamationFill:"transparent"}),autohide:!1,onClick:c&&o?()=>u("networkHealth",{variant:n,title:o,message:c}):void 0}):e&&l({id:e.id})}}else e&&l({id:e.id})}),[p,g]);const b=(0,i.useCallback)((()=>{c&&l({id:c.id})}),[l,c]);return{banner:c,dismissBanner:b}},Y=t(i).memo((e=>{const{banner:n,dismissBanner:r}=e;return t(i).createElement(A.AnimatePresence,null,n&&t(i).createElement(W,{key:"banner",role:"banner","aria-live":(null==n?void 0:n.autohide)?"assertive":"polite","aria-atomic":"true",variant:n.variant,initial:{opacity:0,height:0},animate:{opacity:1,height:"auto"},exit:{opacity:0,height:0},transition:{ease:"easeOut",duration:.2}},t(i).createElement(D,{tabIndex:n.onClick?1:-1,onClick:n.onClick},n.icon,t(i).createElement(H,null,n.message)),n.dismissable&&t(i).createElement(Q,{onClick:r},t(i).createElement(q.IconClose,{width:14,fill:"#FFFFFF"}))))})),_=()=>{const e=V(k.hooks.useSelectedSolanaConnection,k.hooks.useIsTestnetMode,k.hooks.useIsLocalnetMode);return t(i).createElement(Y,Object.assign({},e))},G=()=>t(i).createElement(_,null);q=a("j81qC");var U=a("cleOt"),J=(d=a("csW2r"),a("4VuRl")),K=(A=a("1fwzV"),j=a("lz5BI"),i=a("29o0l"),v=a("iQL9s"),c=a("ljwNC"),a("3w1Ia")),X=(p=a("gkfw3"),a("i1NO2")),Z=(S=a("twk6W"),a("k1KLq")),ee=(j=a("lz5BI"),a("70W8C"));i=a("29o0l");const te=(0,(p=a("gkfw3")).default)(j.motion.div)`
  position: absolute;
  top: 0px;
  left: 0;
  width: 0;
  height: 2px;
  background-color: #ab9ff2;
`,ne=({refs:e,activeRoute:n,onFinishedAnimating:r,isAnimating:o})=>{const[{x:a,width:l},c]=(0,i.useState)({x:0,width:0}),s=(0,i.useCallback)((()=>{e&&e[n]&&e[n].current&&c({x:e[n].current.offsetLeft,width:e[n].current.getBoundingClientRect().width})}),[n,e]);return(0,i.useEffect)((()=>{s()}),[n,e,s]),(0,i.useEffect)((()=>{const e=t(ee)((()=>{s()}),500);return window.addEventListener("resize",e),()=>{window.removeEventListener("resize",e)}})),t(i).createElement(te,{animate:{x:a,width:l},style:{opacity:o?1:0},onAnimationComplete:r,transition:{duration:.4,type:"spring"}})},re=p.default.div`
  position: relative;
  height: ${60}px;
  display: flex;
`,oe=(0,p.default)(j.motion.div)`
  flex: 1;
  overflow-x: hidden;
  padding: ${({padding:e})=>"number"==typeof e?e:16}px;
`,ae=(0,p.default)(Z.Footer)`
  flex: 1;
  display: flex;
  justify-content: space-around;
  padding: 0px 10px;
`,ie=t(i).memo((({items:e})=>{const n=(0,v.useLocation)(),r=(0,K.default)(n),[o,a]=(0,i.useState)(!1),l=(0,i.useMemo)((()=>e.find((e=>(0,c.matchPath)({path:`/${e.route}`,end:!0},n.pathname)))),[e,n.pathname]),s=l&&l.route,u=(0,i.useMemo)((()=>e.reduce(((e,t)=>(e[t.route]=(0,i.createRef)(),e)),{})),[e]),f=n.pathname!=(null==r?void 0:r.pathname)&&null!=(null==r?void 0:r.pathname),m=(0,i.useMemo)((()=>e.map((o=>{const a=t(i).memo((()=>{var a;let l=0;if(f){l=le(e,n.pathname,null!==(a=null==r?void 0:r.pathname)&&void 0!==a?a:"")?10:-10}return t(i).createElement(oe,{id:"tab-content","data-testid":`tab-content-${o.route}`,initial:{x:l,opacity:0},animate:{x:0,opacity:1},exit:{opacity:0},transition:{duration:.1},padding:o.padding},t(i).createElement(X.DetailViewsProvider,{shouldResetOnAccountChange:!0},o.renderContent()))}));return t(i).createElement(c.Route,{key:o.route,path:`/${o.route}`,element:t(i).createElement(a,null)})}))),[e,n]),p=(0,i.useCallback)((e=>{a(!0),S.analytics.capture("tabPress",{data:{target:e}}),d.telemetry.addBreadcrumb(d.FeatureTag.Generic,`Tab changed to ${e}`,d.Severity.Info)}),[]);return t(i).createElement(t(i).Fragment,null,t(i).createElement(A.AnimatePresence,{mode:"wait",initial:!1},t(i).createElement(c.Routes,{location:n,key:n.pathname},m,t(i).createElement(c.Route,{key:"redirection",element:t(i).createElement(j.motion.div,{exit:{opacity:0},transition:{duration:.1}},t(i).createElement(c.Navigate,{to:e[0]?e[0].route:"/"}))}))),t(i).createElement(re,null,t(i).createElement(ne,{refs:u,activeRoute:s,onFinishedAnimating:()=>a(!1),isAnimating:o}),t(i).createElement(ae,{role:"tablist","aria-orientation":"horizontal"},e.map((e=>t(i).createElement(ue,{isActive:s===e.route,key:e.route,item:e,ref:u[e.route],isAnimating:o,onClick:()=>p(e.route)}))))),t(i).createElement("div",{"aria-hidden":!0,"data-testid":"current-route","data-location":n.pathname}))}),((e,t)=>(0,J.dequal)(e.items.map((e=>e.route)),t.items.map((e=>e.route))))),le=(e,t,n)=>e.findIndex((e=>e.route===ce(t)))>e.findIndex((e=>e.route===ce(n))),ce=e=>"/"===e?e:e.replace(/^\/+/g,""),se=(0,p.default)(v.Link)`
  display: block;
  padding: 15px 0px;
  margin: 0px 12px;
  position: relative;
  width: 100%;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  :hover {
    color: white;
    svg {
      fill: white;

      path {
        fill: white;
      }
    }
  }
  :after {
    content: "";
    position: absolute;
    top: -1px;
    left: 0;
    height: 2px;
    width: 100%;
    border-radius: 2px;
    ${e=>e.$isActive&&!e.$isAnimating&&"background-color: #AB9FF2;"}
    ${e=>e.$isAnimating&&"background-color: transparent;"}
  }
  svg {
    fill: #666;
    transition: fill 200ms ease;
    ${e=>e.$isActive&&"fill: white;"}

    path {
      ${e=>e.$isActive?"fill: white;":"fill: #666;"}
    }
  }
`,ue=(0,i.forwardRef)((({isActive:e,item:n,isAnimating:r,onClick:o},a)=>t(i).createElement(se,{"aria-label":n.label,"data-testid":`bottom-tab-nav-button-${n.route}`,$isActive:e,$isAnimating:r,to:n.route,ref:a,onClick:o},n.renderButton())));var de={};e(de,"WhatsNewOverlay",(function(){return ge}),(function(e){return ge=e}));x=a("43063"),i=a("29o0l"),v=a("iQL9s"),p=a("gkfw3"),O=a("9aR5q");var fe=a("hFkH3"),me=a("27SDj"),pe=function(e,t,n,r){return new(n||(n=Promise))((function(o,a){function i(e){try{c(r.next(e))}catch(e){a(e)}}function l(e){try{c(r.throw(e))}catch(e){a(e)}}function c(e){var t;e.done?o(e.value):(t=e.value,t instanceof n?t:new n((function(e){e(t)}))).then(i,l)}c((r=r.apply(e,t||[])).next())}))};const ge=({onClose:e})=>{const{t:n}=(0,x.useTranslation)(),r=(0,v.useNavigate)();return t(i).createElement(he,null,t(i).createElement(be,null,t(i).createElement(me.Text,{color:"#e2dffe",size:16,weight:600},n("whatsNewOverlayNew"))),t(i).createElement(xe,null,n("whatsNewOverlayv3ActionBurnSpam")),t(i).createElement(ve,null,n("whatsNewOverlayv3SecondaryText")),t(i).createElement(we,{color:"#e2dffe",size:16,weight:500,onClick:()=>pe(void 0,void 0,void 0,(function*(){e(),r(O.Path.Collectibles)}))},n("whatsNewOverlayv2ActionTryItNow")),t(i).createElement(ye,null),t(i).createElement(Ee,null,t(i).createElement(ke,{onClick:e})))},he=p.default.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  height: 100%;
  width: 100%;
  padding: 20px;
`,ye=p.default.div`
  flex: 1;
`,be=p.default.div`
  margin-top: 40px;
  align-self: center;
  width: 76px;
  height: 35px;
  background-color: rgba(138, 129, 248, 0.1);
  border-radius: 100px;
  display: flex;
  justify-content: center;
  align-items: center;
`,xe=(0,p.default)(me.Text).attrs({size:28,weight:500})`
  align-self: center;
  margin-top: 22px;
  line-height: 34px;
  max-width: 275px;
  text-align: center;
`,ve=(0,p.default)(me.Text).attrs({size:16,color:"#777"})`
  align-self: center;
  margin-top: 22px;
  max-width: 275px;
  text-align: center;
  span {
    color: white;
  }
`,we=(0,p.default)(me.Text).attrs({color:"#e2dffe",size:16,weight:500})`
  cursor: pointer;
  margin-top: 22px;
`,Ee=p.default.div``,ke=e=>{const{t:n}=(0,x.useTranslation)();return t(i).createElement(fe.Button,Object.assign({type:"button",theme:"default"},e),n("commandClose"))},Ce=t(i).lazy((()=>a("hH9iQ"))),Oe=t(i).lazy((()=>a("a9fRR"))),Te=t(i).lazy((()=>a("43ULJ"))),Se=t(i).lazy((()=>a("iOeB3"))),Fe=t(i).lazy((()=>a("fwBWQ"))),Me=t(i).lazy((()=>a("3spqi"))),Ae=()=>{const{data:e}=k.hooks.useWhatsNewOverlay(),{mutateAsync:n}=k.hooks.useSetAcknowledgeWhatsNewOverlay(),{data:r=[]}=k.hooks.useAllMultiChainAccounts(),{data:[o]}=(0,b.useFeatureFlags)(["frontend-enable-session-start"]);return(0,C.useEffectOnce)((()=>{T.accountAnalytics.onAppSessionStart(r)}),r.length>0&&o),(0,i.useEffect)((()=>{S.analytics.captureOptOutStatus()}),[]),k.hooks.useRemoveLegacyStorageData((0,F.getManifestVersion)()),e?t(i).createElement(t(i).Fragment,null,t(i).createElement(je,null),t(i).createElement(de.WhatsNewOverlay,{onClose:()=>{n()}})):t(i).createElement(t(i).Fragment,null,t(i).createElement(je,null),t(i).createElement(G,null),t(i).createElement(Be,null),t(i).createElement("div",{id:w.MODAL_ID}))},je=()=>{const e=(0,c.useMatch)(O.Path.Swap)?t(i).createElement(Me,null):null;return t(i).createElement(U.MultichainAccountHeader,{enableEditAccount:!0,enableMenu:!0,rightMenuButton:e,"data-testid":"multichain-account-header"})},Be=()=>{const{data:e}=k.hooks.useWhatsNewOverlay(),{data:n}=k.hooks.useSelectedMultiChainAccountIdentifier(),{data:r}=k.hooks.useSelectedMultiChainAccount(),o=null==r?void 0:r.isReadOnly,a=b.featureFlagClient.isFeatureEnabled("kill-swapper")||o,l=b.featureFlagClient.isFeatureEnabled("kill-explore"),c=b.featureFlagClient.isFeatureEnabled("kill-collectibles"),{t:s}=(0,x.useTranslation)(),{pathname:u}=(0,v.useLocation)(),d=(0,v.useNavigate)(),{closeAllModals:f}=(0,E.useLegacyModals)();k.hooks.useLogTimestamps(),(0,i.useEffect)((()=>{e||(f(),u!==O.Path.Wallet&&d(O.Path.Wallet))}),[n,e]);const m=(0,i.useMemo)((()=>[{label:s("homeTab"),route:O.Path.Wallet,renderButton:()=>t(i).createElement(q.IconWallet,null),renderContent:()=>t(i).createElement(Ce,null)},c?null:{label:s("collectiblesTab"),route:O.Path.Collectibles,renderButton:()=>t(i).createElement(q.IconCollectibles,{width:22}),renderContent:()=>t(i).createElement(Oe,null)},a?null:{label:s("swapTab"),route:O.Path.Swap,renderButton:()=>t(i).createElement(q.IconArrowDouble,{width:24,height:24}),renderContent:()=>t(i).createElement(Te,null)},{label:s("activityTab"),route:O.Path.Notifications,renderButton:()=>t(i).createElement(q.IconNotifications,null),renderContent:()=>t(i).createElement(Se,null)},l?null:{label:s("exploreTab"),route:O.Path.Explore,renderButton:()=>t(i).createElement(q.IconGlobeOutline,{width:34}),renderContent:()=>t(i).createElement(Fe,null),padding:0}].filter((e=>null!==e))),[c,l,a,s]);return t(i).createElement(i.Suspense,null,t(i).createElement(ie,{items:m}))};w=a("c8OXT");var Re=a("iyhug"),Pe=a("gRICw"),$e=a("41yT6"),Ne=a("cIhSd"),Le=a("6SBoM"),Ie=(L=a("feAoQ"),a("goVRJ")),ze=a("4K7Du"),qe=(S=a("twk6W"),F=a("gcdBN"),a("dNPkM")),De=a("17H3T"),We=a("2jR04"),He=(p=a("gkfw3"),{});e(He,"reset",(function(){return _e}),(function(e){return _e=e})),e(He,"Reset",(function(){return Ge}),(function(e){return Ge=e})),e(He,"default",(function(){return Ue}),(function(e){return Ue=e}));var Qe,Ve,Ye=function(e,t){return Object.defineProperty?Object.defineProperty(e,"raw",{value:t}):e.raw=t,e},_e=(0,(p=a("gkfw3")).css)(Qe||(Qe=Ye(["\n/* http://meyerweb.com/eric/tools/css/reset/\n   v5.0.1 | 20191019\n   License: none (public domain)\n*/\n\nhtml, body, div, span, applet, object, iframe,\nh1, h2, h3, h4, h5, h6, p, blockquote, pre,\na, abbr, acronym, address, big, cite, code,\ndel, dfn, em, img, ins, kbd, q, s, samp,\nsmall, strike, strong, sub, sup, tt, var,\nb, u, i, center,\ndl, dt, dd, menu, ol, ul, li,\nfieldset, form, label, legend,\ntable, caption, tbody, tfoot, thead, tr, th, td,\narticle, aside, canvas, details, embed,\nfigure, figcaption, footer, header, hgroup,\nmain, menu, nav, output, ruby, section, summary,\ntime, mark, audio, video {\n  margin: 0;\n  padding: 0;\n  border: 0;\n  font-size: 100%;\n  font: inherit;\n  vertical-align: baseline;\n}\n/* HTML5 display-role reset for older browsers */\narticle, aside, details, figcaption, figure,\nfooter, header, hgroup, main, menu, nav, section {\n  display: block;\n}\n/* HTML5 hidden-attribute fix for newer browsers */\n*[hidden] {\n    display: none;\n}\nbody {\n  line-height: 1;\n}\nmenu, ol, ul {\n  list-style: none;\n}\nblockquote, q {\n  quotes: none;\n}\nblockquote:before, blockquote:after,\nq:before, q:after {\n  content: '';\n  content: none;\n}\ntable {\n  border-collapse: collapse;\n  border-spacing: 0;\n}\n"],["\n/* http://meyerweb.com/eric/tools/css/reset/\n   v5.0.1 | 20191019\n   License: none (public domain)\n*/\n\nhtml, body, div, span, applet, object, iframe,\nh1, h2, h3, h4, h5, h6, p, blockquote, pre,\na, abbr, acronym, address, big, cite, code,\ndel, dfn, em, img, ins, kbd, q, s, samp,\nsmall, strike, strong, sub, sup, tt, var,\nb, u, i, center,\ndl, dt, dd, menu, ol, ul, li,\nfieldset, form, label, legend,\ntable, caption, tbody, tfoot, thead, tr, th, td,\narticle, aside, canvas, details, embed,\nfigure, figcaption, footer, header, hgroup,\nmain, menu, nav, output, ruby, section, summary,\ntime, mark, audio, video {\n  margin: 0;\n  padding: 0;\n  border: 0;\n  font-size: 100%;\n  font: inherit;\n  vertical-align: baseline;\n}\n/* HTML5 display-role reset for older browsers */\narticle, aside, details, figcaption, figure,\nfooter, header, hgroup, main, menu, nav, section {\n  display: block;\n}\n/* HTML5 hidden-attribute fix for newer browsers */\n*[hidden] {\n    display: none;\n}\nbody {\n  line-height: 1;\n}\nmenu, ol, ul {\n  list-style: none;\n}\nblockquote, q {\n  quotes: none;\n}\nblockquote:before, blockquote:after,\nq:before, q:after {\n  content: '';\n  content: none;\n}\ntable {\n  border-collapse: collapse;\n  border-spacing: 0;\n}\n"]))),Ge=(0,p.createGlobalStyle)(Ve||(Ve=Ye(["",""],["",""])),_e),Ue=_e;w=a("c8OXT");const Je=p.css`
  ::-webkit-scrollbar {
    background: #222;
    width: 7px;
  }

  ::-webkit-scrollbar-thumb {
    background: #2a2a2a;
    border-radius: 8px;
  }
`,Ke=p.css`
  ::-webkit-scrollbar {
    display: none;
  }
  * {
    scrollbar-width: none; /* Also needed to disable scrollbar Firefox */
  }
`,Xe=p.createGlobalStyle`
    ${He.default}

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

    ${w.BROWSER_ENV.os.name===We.OS_MAP.MacOS||w.BROWSER_ENV.os.name===We.OS_MAP.Windows?Ke:Je}
`;d.fileLogger.init({provider:De.ClientFileLoggerProvider}),d.telemetry.init(),d.telemetry.setUser({id:S.analytics.getDeviceId()}),(0,qe.initializeFeatureFlags)(),(0,f.reconcilePendingTransactions)(new(0,Ie.LegacyIndexedDBProxy)),(0,f.addOnUpdateHandler)(((e,t)=>(0,f.updateMinedTransactionsHandler)(e,t,S.analytics))),(0,f.addOnRemoveHandler)(f.removeMinedTransactionsHandler);const Ze=()=>{(0,i.useEffect)((()=>{S.analytics.capture("popupOpen")}),[]);const e=(0,i.useCallback)((()=>{(0,F.openTabAsync)({url:"onboarding.html"}),window.close()}),[]);return t(i).createElement(t(i).Fragment,null,t(i).createElement(c.MemoryRouter,{future:{v7_startTransition:!0}},t(i).createElement(p.ThemeProvider,{theme:ze.theme},t(i).createElement(m.ThemeProvider,null,t(i).createElement(Xe,{backgroundColor:"#222222"}),t(i).createElement(g.PopupAndNotificationErrorBoundary,null,t(i).createElement(h.Main,{withBorder:!0},t(i).createElement($,null,t(i).createElement($e.QueryProvider,null,t(i).createElement(Le.ExtensionLockWrapper,{openOnboarding:e},t(i).createElement(Re.LegacyModalsProvider,null,t(i).createElement(L.Modals,null,t(i).createElement(Ne.SettingsMenuProvider,null,t(i).createElement(Pe.MenuProvider,null,t(i).createElement(Ae,null)))))))),t(i).createElement("div",{id:w.MODAL_ID}),t(i).createElement(y.Toaster,null)))))))},et=document.getElementById("root");(0,l.createRoot)(et).render(t(i).createElement(Ze,null))}();
//# sourceMappingURL=popup.4aed6b21.js.map
define=__define;})(window.define);