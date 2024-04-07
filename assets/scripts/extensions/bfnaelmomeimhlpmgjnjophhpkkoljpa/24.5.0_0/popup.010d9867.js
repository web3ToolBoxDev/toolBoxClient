(function(define){var __define;"function"==typeof define&&define.amd&&(__define=define,define=null);
function e(e,t,n,a){Object.defineProperty(e,t,{get:n,set:a,enumerable:!0,configurable:!0})}function t(e){return e&&e.__esModule?e.default:e}var n="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{},a={},r={},i=n.parcelRequire1d24;null==i&&((i=function(e){if(e in a)return a[e].exports;if(e in r){var t=r[e];delete r[e];var n={id:e,exports:{}};return a[e]=n,t.call(n.exports,n,n.exports),n.exports}var i=new Error("Cannot find module '"+e+"'");throw i.code="MODULE_NOT_FOUND",i}).register=function(e,t){r[e]=t},n.parcelRequire1d24=i),i.register("5V6iE",(function(t,n){var a,r;e(t.exports,"register",(function(){return a}),(function(e){return a=e})),e(t.exports,"resolve",(function(){return r}),(function(e){return r=e}));var i={};a=function(e){for(var t=Object.keys(e),n=0;n<t.length;n++)i[t[n]]=e[t[n]]},r=function(e){var t=i[e];if(null==t)throw new Error("Could not resolve bundle with id "+e);return t}})),i.register("gdILj",(function(t,n){e(t.exports,"useEffectOnce",(function(){return r}));var a=i("lDSNw");const r=(e,t)=>{const n=(0,a.useRef)(!1);(0,a.useEffect)((()=>{if(!n.current&&t)return n.current=!0,e()}))}})),i.register("jVSWn",(function(t,n){e(t.exports,"default",(function(){return r}));var a=i("lDSNw");function r(e){var t=(0,a.useRef)();return(0,a.useEffect)((function(){t.current=e})),t.current}})),i.register("f0DVW",(function(e,t){e.exports=import("./"+i("5V6iE").resolve("gXZll")).then((()=>i("bNkV0")))})),i.register("hMAzI",(function(e,t){e.exports=import("./"+i("5V6iE").resolve("8PnUH")).then((()=>i("3WqdX")))})),i.register("7Fcto",(function(e,t){e.exports=import("./"+i("5V6iE").resolve("cB1wS")).then((()=>i("8FuDc")))})),i.register("dUBWK",(function(e,t){e.exports=import("./"+i("5V6iE").resolve("aGeWF")).then((()=>i("eDKJc")))})),i.register("6xG5P",(function(e,t){e.exports=import("./"+i("5V6iE").resolve("6Z3u4")).then((()=>i("Cx7PX")))})),i.register("54tAn",(function(e,t){e.exports=import("./"+i("5V6iE").resolve("lwXty")).then((()=>i("4jJyn")))})),i.register("5ftLv",(function(n,a){e(n.exports,"ConfirmationIconType",(function(){return f})),e(n.exports,"ConfirmationIcon",(function(){return g}));var r=i("7dqns"),l=i("c1thM"),o=i("lDSNw"),c=i("cZIbv"),s=i("miiws"),u=i("aanFI");const d=c.default.div`
  position: relative;
`,m=(0,c.default)(l.motion.div)`
  width: ${e=>e.width}px;
  height: ${e=>e.width}px;
`,p=(0,c.default)(l.motion.div)`
  top: 0;
  width: 100%;
  height: 100%;
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
`;var f,h;(h=f||(f={})).Default="default",h.Warning="warning",h.Failure="failure",h.Success="success";const g=({type:e,iconWidth:n,defaultIcon:a,backgroundWidth:i=94})=>t(o).createElement(d,null,t(o).createElement(r.AnimatePresence,{mode:"wait",initial:!1},t(o).createElement(m,{width:i,key:e,initial:{opacity:0},animate:{opacity:1},exit:{opacity:0},transition:{duration:.2}},(()=>{switch(e){case f.Default:return t(o).createElement(s.Circle,{diameter:i,color:"#181818",includeDarkBoxShadow:!0});case f.Warning:return t(o).createElement(s.Circle,{diameter:i,color:"#FFDC62",opacity:.1});case f.Failure:return t(o).createElement(s.Circle,{diameter:i,color:"#EB3742",opacity:.1});case f.Success:return t(o).createElement(s.Circle,{diameter:i,color:"#21E56F",opacity:.1})}})())),t(o).createElement(r.AnimatePresence,{mode:"wait",initial:!0},t(o).createElement(p,{key:e,initial:{opacity:0,y:10},animate:{opacity:1,y:0},exit:{opacity:0,y:10},transition:{duration:.4,bounce:.4,type:"spring"}},(()=>{switch(e){case f.Default:return null!=a?a:t(o).createElement(u.IconQuestionMark,{width:null!=n?n:30});case f.Warning:return t(o).createElement(u.IconExclamationMarkCircle,{width:40,height:40,circleFill:"#FFDC62",exclamationFill:"#00000000"});case f.Failure:return t(o).createElement(u.IconFailure,{width:null!=n?n:30});case f.Success:return t(o).createElement(u.IconCheckmark,{height:"100%",width:null!=n?n:40,fill:"#21E56F"})}})())))})),i.register("kpxNY",(function(n,a){e(n.exports,"IconHeaderStyle",(function(){return g})),e(n.exports,"IconHeader",(function(){return b}));var r=i("lDSNw"),l=i("cZIbv"),o=i("e0omL"),c=i("aanFI"),s=i("kn91D");const u=l.default.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`,d=l.keyframes`
  0% {
    top: 15px;
    opacity: 0;
  };
  100% {
    top: 0px;
    opacity: 1;
  };
`,m=l.default.div`
  animation-name: ${e=>e.animateText?d:"none"};
  animation-duration: ${e=>e.animateText?".5s":"0s"};
  position: relative;
`,p=(0,l.default)(s.Text)`
  margin: ${e=>e.margin};
`;p.defaultProps={margin:"20px auto 0 auto"};const f=(0,l.default)(s.Text)`
  margin: ${e=>e.margin};
`;f.defaultProps={margin:"15px 0px 0px 0px"};const h=l.default.div`
  position: relative;
  left: 38px;
  bottom: 22px;
`;var g,v;(v=g||(g={})).Medium="medium",v.Large="large",v.Small="small";const y={[g.Large]:30,[g.Medium]:28,[g.Small]:24},x={[g.Large]:34,[g.Medium]:34,[g.Small]:29},E={[g.Large]:18,[g.Medium]:16,[g.Small]:14},b=({className:e,icon:n,primaryText:a,secondaryText:i,headerStyle:l,showWarning:s=!1,showError:d=!1,animateText:v=!1})=>{l=null!=l?l:g.Medium;const b=y[l],w=x[l],k=E[l],C={[g.Large]:22,[g.Medium]:19,[g.Small]:17}[l],T="small"===l?"16px 0 0 0":void 0,F=d?o.ERROR_COLOR:"#777777";return t(r).createElement(u,{className:e},null!=n?n:t(r).createElement(c.IconUnknownOrigin,null),s?t(r).createElement(h,null,t(r).createElement(c.IconExclamationMarkCircle,null)):t(r).createElement(t(r).Fragment,null),t(r).createElement(m,{animateText:v},a&&t(r).createElement(p,{margin:T,weight:500,size:b,lineHeight:w,maxWidth:"320px"},a),i&&t(r).createElement(f,{margin:T,wordBreak:"break-word",size:k,lineHeight:C,color:F},i)))};b.defaultProps={headerStyle:g.Medium}})),i.register("e0omL",(function(t,n){e(t.exports,"WARNING_COLOR",(function(){return a})),e(t.exports,"DANGER_COLOR",(function(){return r})),e(t.exports,"ERROR_COLOR",(function(){return i}));const a="#FFDC62",r="#EB3742",i="#eb3742"})),i.register("axUHJ",(function(n,a){e(n.exports,"PTrans",(function(){return s}),(function(e){return s=e}));var r=i("lMzyG"),l=i("lDSNw"),o=i("kBpKb"),c=function(e,t){var n={};for(var a in e)Object.prototype.hasOwnProperty.call(e,a)&&t.indexOf(a)<0&&(n[a]=e[a]);if(null!=e&&"function"==typeof Object.getOwnPropertySymbols){var r=0;for(a=Object.getOwnPropertySymbols(e);r<a.length;r++)t.indexOf(a[r])<0&&Object.prototype.propertyIsEnumerable.call(e,a[r])&&(n[a[r]]=e[a[r]])}return n};const s=t(l).memo((e=>{const{children:n,i18nKey:a}=e,i=c(e,["children","i18nKey"]),{t:s}=(0,r.useTranslation)(),u=(0,l.useMemo)((()=>(a?`${s(a,Object.assign(Object.assign({},i),i.values))}`:"").replace(/<\/?[^>]+(>|$)/g,"")),[a,i,s]);return t(l).createElement(o.ErrorBoundary,{fallback:u},t(l).createElement(r.Trans,Object.assign({i18nKey:a},i),n))}))})),i("5V6iE").register(JSON.parse('{"loI2u":"popup.010d9867.js","gXZll":"HomeTabPage.0d4c362a.js","8PnUH":"CollectionsPage.163591da.js","cB1wS":"SwapTabPage.71ae0f47.js","aGeWF":"RecentActivity.dba769e7.js","6Z3u4":"ExplorePage.4e464988.js","lwXty":"SwapSettingsButton.dcca0fcd.js","9Dpy0":"notification.5cbd182e.css","loP8i":"phishing.8cf80063.js","dIWgK":"metaplex.04cfb981.js","kJjdp":"metaplex.8ad40d27.js","7jMPF":"collectibles.4fd9b29c.js","azrTG":"staking.037c2788.js","amlOx":"swapper.c615a942.js","j6p7Z":"notification.0d622a75.js","1ueev":"ConnectHardwareMultichainFlow.ad78d4a0.js","eBtTe":"connect_hardware.c9d6b878.js","h3Y5v":"onboarding.21ea182c.js"}'));var l=i("lDSNw"),o=i("dU2RF"),c=i("aJuCi");i("1KK14");var s,u,d=i("4yY1D"),m=i("4raQz"),p=i("jlKgL"),f=i("cZIbv"),h=i("kBpKb"),g=i("b883z"),v=i("8WrfF"),y=i("lBuGR"),x=i("lMzyG"),E=(l=i("lDSNw"),i("lz7nT")),b=(i("aJuCi"),i("ibYAx")),w=i("aXzxc"),k=i("gMNJN"),C=i("gdILj"),T=i("8182A"),F=i("jZyqE"),M=i("h5kyv"),A=i("d1qx3"),S=(x=i("lMzyG"),i("4y59b")),B=i("7dqns"),O=i("c1thM"),P=(l=i("lDSNw"),f=i("cZIbv"),l=i("lDSNw"),i("8PPME"));(u=s||(s={})).NetworkHealth="network-health",u.Cluster="cluster",u.TestnetMode="testnet-mode";const I=(0,l.createContext)(null),D=()=>{const e=(0,l.useContext)(I);if(!e)throw new Error("Missing banner context. Make sure you're wrapping your component in a <BannerProvider />");return e},N=({children:e})=>{const n=[],[a,r]=(0,l.useReducer)(((e,t)=>{switch(t.type){case"create":return e.concat(t.payload);case"delete":return e.filter((({id:e})=>e!==t.payload.id));case"reset":return n;default:throw new Error("There was an error dispatching a banner action.")}}),n),i=e=>r({type:"delete",payload:{id:e.id}});return t(l).createElement(I.Provider,{value:{banners:a,createBanner:e=>{const{type:t,variant:n,message:a,dismissable:l=!0,icon:o,autohide:c=!0,delay:s=5e3,onClick:u}=e;t&&n&&a||console.error("You must supply a type, variant and message when creating a Banner.");const d=(0,P.default)();return r({type:"create",payload:{id:d,type:t,variant:n,message:a,dismissable:l,icon:o,autohide:c,delay:s,onClick:u}}),c&&setTimeout((()=>{i({id:d})}),s),d},deleteBanner:i,resetBanners:()=>r({type:"reset"})}},e)};var j=i("7J3aJ"),R=(k=i("gMNJN"),i("2LZGp")),L=i("aPmuP"),z=i("1yIB4"),W=i("aanFI");const $=f.default.button`
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
`,G=(0,f.default)(O.motion.div)`
  position: relative;
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: ${e=>{switch(e.variant){case z.CTAVariant.Primary:return(0,S.hexToRGB)("#AB9FF2",.7);case z.CTAVariant.Success:return(0,S.hexToRGB)("#21E56F",.7);case z.CTAVariant.Warning:return(0,S.hexToRGB)("#E5A221",.7);case z.CTAVariant.Danger:return(0,S.hexToRGB)("#EB3742",.7);default:return(0,S.hexToRGB)("#E5A221",.7)}}};

  ${$} {
    &:focus-visible {
      border-color: ${e=>{switch(e.variant){case z.CTAVariant.Primary:return(0,S.hexToRGB)("#AB9FF2",.7);case z.CTAVariant.Success:return(0,S.hexToRGB)("#21E56F",.7);case z.CTAVariant.Warning:return(0,S.hexToRGB)("#E5A221",.7);case z.CTAVariant.Danger:return(0,S.hexToRGB)("#EB3742",.7);default:return(0,S.hexToRGB)("#E5A221",.7)}}};
    }
  }
`,V=f.default.p`
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  line-height: 19px;
  text-align: left;

  svg {
    margin-right: 10px;
  }
`,H=f.default.button`
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
    border-color: ${(0,S.hexToRGB)("#FFFFFF",.3)};
  }

  svg {
    fill: #ffffff;
    margin: 0;
  }
`,K=(e,n,a)=>{const{banners:r,createBanner:i,deleteBanner:o}=D(),c=r[r.length-1],{handleShowModalVisibility:u}=(0,R.useModals)(),{showSettingsMenu:d}=(0,j.useSettingsMenu)(),{t:m,i18n:p}=(0,x.useTranslation)(),{cluster:f}=e(),h=k.hooks.useNetworkHealth(p.language).data,g=n(),v=a();(0,l.useEffect)((()=>{const e=r.find((e=>e.type===s.TestnetMode));e&&o({id:e.id}),v?i({type:s.TestnetMode,variant:z.CTAVariant.Warning,message:m("featureNotSupportedOnLocalNet"),dismissable:!1,autohide:!1,onClick:()=>d(void 0,t(l).createElement(L.MultiChainDeveloperSettings,null))}):g&&i({type:s.TestnetMode,variant:z.CTAVariant.Warning,message:m("connectionClusterTestnetMode"),dismissable:!1,autohide:!1,onClick:()=>d(void 0,t(l).createElement(L.MultiChainDeveloperSettings,null))})}),[v,g,m]),(0,l.useEffect)((()=>{if(!f)return;const e=r.find((e=>e.type===s.NetworkHealth));if("mainnet-beta"===f){if(h){const{bannerVariant:n,bannerMessage:a,notificationMessageTitle:r,notificationMessage:c}=h;!!n&&!!a?a!==(null==e?void 0:e.message)&&i({type:s.NetworkHealth,variant:n,message:a,dismissable:!1,icon:t(l).createElement(W.IconExclamationMarkCircle,{width:14,height:14,circleFill:"#FFFFFF",exclamationFill:"transparent"}),autohide:!1,onClick:c&&r?()=>u("networkHealth",{variant:n,title:r,message:c}):void 0}):e&&o({id:e.id})}}else e&&o({id:e.id})}),[f,h]);const y=(0,l.useCallback)((()=>{c&&o({id:c.id})}),[o,c]);return{banner:c,dismissBanner:y}},Z=t(l).memo((e=>{const{banner:n,dismissBanner:a}=e;return t(l).createElement(B.AnimatePresence,null,n&&t(l).createElement(G,{key:"banner",role:"banner","aria-live":(null==n?void 0:n.autohide)?"assertive":"polite","aria-atomic":"true",variant:n.variant,initial:{opacity:0,height:0},animate:{opacity:1,height:"auto"},exit:{opacity:0,height:0},transition:{ease:"easeOut",duration:.2}},t(l).createElement($,{tabIndex:n.onClick?1:-1,onClick:n.onClick},n.icon,t(l).createElement(V,null,n.message)),n.dismissable&&t(l).createElement(H,{onClick:a},t(l).createElement(W.IconClose,{width:14,fill:"#FFFFFF"}))))})),J=()=>{const e=K(k.hooks.useSelectedSolanaConnection,k.hooks.useIsTestnetMode,k.hooks.useIsLocalnetMode);return t(l).createElement(Z,Object.assign({},e))},q=()=>t(l).createElement(J,null);W=i("aanFI");var _=i("ad7JL"),U=(d=i("4yY1D"),i("6nLCM")),Y=(B=i("7dqns"),O=i("c1thM"),l=i("lDSNw"),E=i("lz7nT"),c=i("aJuCi"),i("jVSWn")),X=(f=i("cZIbv"),i("6ha3o")),Q=(M=i("h5kyv"),i("gKTq7")),ee=(O=i("c1thM"),i("egSKH"));l=i("lDSNw");const te=(0,(f=i("cZIbv")).default)(O.motion.div)`
  position: absolute;
  top: 0px;
  left: 0;
  width: 0;
  height: 2px;
  background-color: #ab9ff2;
`,ne=({refs:e,activeRoute:n,onFinishedAnimating:a,isAnimating:r})=>{const[{x:i,width:o},c]=(0,l.useState)({x:0,width:0}),s=(0,l.useCallback)((()=>{e&&e[n]&&e[n].current&&c({x:e[n].current.offsetLeft,width:e[n].current.getBoundingClientRect().width})}),[n,e]);return(0,l.useEffect)((()=>{s()}),[n,e,s]),(0,l.useEffect)((()=>{const e=t(ee)((()=>{s()}),500);return window.addEventListener("resize",e),()=>{window.removeEventListener("resize",e)}})),t(l).createElement(te,{animate:{x:i,width:o},style:{opacity:r?1:0},onAnimationComplete:a,transition:{duration:.4,type:"spring"}})},ae=f.default.div`
  position: relative;
  height: ${60}px;
  display: flex;
`,re=(0,f.default)(O.motion.div)`
  flex: 1;
  overflow-x: hidden;
  padding: ${({padding:e})=>"number"==typeof e?e:16}px;
`,ie=(0,f.default)(Q.Footer)`
  flex: 1;
  display: flex;
  justify-content: space-around;
  padding: 0px 10px;
`,le=t(l).memo((({items:e})=>{const n=(0,E.useLocation)(),a=(0,Y.default)(n),[r,i]=(0,l.useState)(!1),o=(0,l.useMemo)((()=>e.find((e=>(0,c.matchPath)({path:`/${e.route}`,end:!0},n.pathname)))),[e,n.pathname]),s=o&&o.route,u=(0,l.useMemo)((()=>e.reduce(((e,t)=>(e[t.route]=(0,l.createRef)(),e)),{})),[e]),m=n.pathname!=(null==a?void 0:a.pathname)&&null!=(null==a?void 0:a.pathname),p=(0,l.useMemo)((()=>e.map((r=>{const i=t(l).memo((()=>{var i;let o=0;if(m){o=oe(e,n.pathname,null!==(i=null==a?void 0:a.pathname)&&void 0!==i?i:"")?10:-10}return t(l).createElement(re,{id:"tab-content","data-testid":`tab-content-${r.route}`,initial:{x:o,opacity:0},animate:{x:0,opacity:1},exit:{opacity:0},transition:{duration:.1},padding:r.padding},t(l).createElement(X.DetailViewsProvider,{shouldResetOnAccountChange:!0},r.renderContent()))}));return t(l).createElement(c.Route,{key:r.route,path:`/${r.route}`,element:t(l).createElement(i,null)})}))),[e,n]),f=(0,l.useCallback)((e=>{i(!0),M.analytics.capture("tabPress",{data:{target:e}}),d.telemetry.addBreadcrumb(d.FeatureTag.Generic,`Tab changed to ${e}`,d.Severity.Info)}),[]);return t(l).createElement(t(l).Fragment,null,t(l).createElement(B.AnimatePresence,{mode:"wait",initial:!1},t(l).createElement(c.Routes,{location:n,key:n.pathname},p,t(l).createElement(c.Route,{key:"redirection",element:t(l).createElement(O.motion.div,{exit:{opacity:0},transition:{duration:.1}},t(l).createElement(c.Navigate,{to:e[0]?e[0].route:"/"}))}))),t(l).createElement(ae,null,t(l).createElement(ne,{refs:u,activeRoute:s,onFinishedAnimating:()=>i(!1),isAnimating:r}),t(l).createElement(ie,{role:"tablist","aria-orientation":"horizontal"},e.map((e=>t(l).createElement(ue,{isActive:s===e.route,key:e.route,item:e,ref:u[e.route],isAnimating:r,onClick:()=>f(e.route)}))))),t(l).createElement("div",{"aria-hidden":!0,"data-testid":"current-route","data-location":n.pathname}))}),((e,t)=>(0,U.dequal)(e.items.map((e=>e.route)),t.items.map((e=>e.route))))),oe=(e,t,n)=>e.findIndex((e=>e.route===ce(t)))>e.findIndex((e=>e.route===ce(n))),ce=e=>"/"===e?e:e.replace(/^\/+/g,""),se=(0,f.default)(E.Link)`
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
`,ue=(0,l.forwardRef)((({isActive:e,item:n,isAnimating:a,onClick:r},i)=>t(l).createElement(se,{"aria-label":n.label,"data-testid":`bottom-tab-nav-button-${n.route}`,$isActive:e,$isAnimating:a,to:n.route,ref:i,onClick:r},n.renderButton())));var de={};e(de,"WhatsNewOverlay",(function(){return he}),(function(e){return he=e}));x=i("lMzyG"),l=i("lDSNw"),E=i("lz7nT"),f=i("cZIbv"),T=i("8182A");var me=i("laYjG"),pe=i("kn91D"),fe=function(e,t,n,a){return new(n||(n=Promise))((function(r,i){function l(e){try{c(a.next(e))}catch(e){i(e)}}function o(e){try{c(a.throw(e))}catch(e){i(e)}}function c(e){var t;e.done?r(e.value):(t=e.value,t instanceof n?t:new n((function(e){e(t)}))).then(l,o)}c((a=a.apply(e,t||[])).next())}))};const he=({onClose:e})=>{const{t:n}=(0,x.useTranslation)(),a=(0,E.useNavigate)();return t(l).createElement(ge,null,t(l).createElement(ye,null,t(l).createElement(pe.Text,{color:"#e2dffe",size:16,weight:600},n("whatsNewOverlayNew"))),t(l).createElement(xe,null,n("whatsNewOverlayv3ActionBurnSpam")),t(l).createElement(Ee,null,n("whatsNewOverlayv3SecondaryText")),t(l).createElement(be,{color:"#e2dffe",size:16,weight:500,onClick:()=>fe(void 0,void 0,void 0,(function*(){e(),a(T.Path.Collectibles)}))},n("whatsNewOverlayv2ActionTryItNow")),t(l).createElement(ve,null),t(l).createElement(we,null,t(l).createElement(ke,{onClick:e})))},ge=f.default.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  height: 100%;
  width: 100%;
  padding: 20px;
`,ve=f.default.div`
  flex: 1;
`,ye=f.default.div`
  margin-top: 40px;
  align-self: center;
  width: 76px;
  height: 35px;
  background-color: rgba(138, 129, 248, 0.1);
  border-radius: 100px;
  display: flex;
  justify-content: center;
  align-items: center;
`,xe=(0,f.default)(pe.Text).attrs({size:28,weight:500})`
  align-self: center;
  margin-top: 22px;
  line-height: 34px;
  max-width: 275px;
  text-align: center;
`,Ee=(0,f.default)(pe.Text).attrs({size:16,color:"#777"})`
  align-self: center;
  margin-top: 22px;
  max-width: 275px;
  text-align: center;
  span {
    color: white;
  }
`,be=(0,f.default)(pe.Text).attrs({color:"#e2dffe",size:16,weight:500})`
  cursor: pointer;
  margin-top: 22px;
`,we=f.default.div``,ke=e=>{const{t:n}=(0,x.useTranslation)();return t(l).createElement(me.Button,Object.assign({type:"button",theme:"default"},e),n("commandClose"))},Ce=t(l).lazy((()=>i("f0DVW"))),Te=t(l).lazy((()=>i("hMAzI"))),Fe=t(l).lazy((()=>i("7Fcto"))),Me=t(l).lazy((()=>i("dUBWK"))),Ae=t(l).lazy((()=>i("6xG5P"))),Se=t(l).lazy((()=>i("54tAn"))),Be=()=>{const{data:e}=k.hooks.useWhatsNewOverlay(),{mutateAsync:n}=k.hooks.useSetAcknowledgeWhatsNewOverlay(),{data:a=[]}=k.hooks.useAllMultiChainAccounts(),{data:[r]}=(0,y.useFeatureFlags)(["frontend-enable-session-start"]);return(0,C.useEffectOnce)((()=>{F.accountAnalytics.onAppSessionStart(a)}),a.length>0&&r),(0,l.useEffect)((()=>{M.analytics.captureOptOutStatus()}),[]),k.hooks.useRemoveLegacyStorageData((0,A.getManifestVersion)()),e?t(l).createElement(t(l).Fragment,null,t(l).createElement(Oe,null),t(l).createElement(de.WhatsNewOverlay,{onClose:()=>{n()}})):t(l).createElement(t(l).Fragment,null,t(l).createElement(Oe,null),t(l).createElement(q,null),t(l).createElement(Pe,null),t(l).createElement("div",{id:b.MODAL_ID}))},Oe=()=>{const e=(0,c.useMatch)(T.Path.Swap)?t(l).createElement(Se,null):null;return t(l).createElement(_.MultichainAccountHeader,{enableEditAccount:!0,enableMenu:!0,rightMenuButton:e,"data-testid":"multichain-account-header"})},Pe=()=>{const{data:e}=k.hooks.useWhatsNewOverlay(),{data:n}=k.hooks.useSelectedMultiChainAccountIdentifier(),{data:a}=k.hooks.useSelectedMultiChainAccount(),r=null==a?void 0:a.isReadOnly,i=y.featureFlagClient.isFeatureEnabled("kill-swapper")||r,o=y.featureFlagClient.isFeatureEnabled("kill-explore"),c=y.featureFlagClient.isFeatureEnabled("kill-collectibles"),{t:s}=(0,x.useTranslation)(),{pathname:u}=(0,E.useLocation)(),d=(0,E.useNavigate)(),{closeAllModals:m}=(0,w.useLegacyModals)();k.hooks.useLogTimestamps(),(0,l.useEffect)((()=>{e||(m(),u!==T.Path.Wallet&&d(T.Path.Wallet))}),[n,e]);const p=(0,l.useMemo)((()=>[{label:s("homeTab"),route:T.Path.Wallet,renderButton:()=>t(l).createElement(W.IconWallet,null),renderContent:()=>t(l).createElement(Ce,null)},c?null:{label:s("collectiblesTab"),route:T.Path.Collectibles,renderButton:()=>t(l).createElement(W.IconCollectibles,{width:22}),renderContent:()=>t(l).createElement(Te,null)},i?null:{label:s("swapTab"),route:T.Path.Swap,renderButton:()=>t(l).createElement(W.IconArrowDouble,{width:24,height:24}),renderContent:()=>t(l).createElement(Fe,null)},{label:s("activityTab"),route:T.Path.Notifications,renderButton:()=>t(l).createElement(W.IconNotifications,null),renderContent:()=>t(l).createElement(Me,null)},o?null:{label:s("exploreTab"),route:T.Path.Explore,renderButton:()=>t(l).createElement(W.IconGlobeOutline,{width:34}),renderContent:()=>t(l).createElement(Ae,null),padding:0}].filter((e=>null!==e))),[c,o,i,s]);return t(l).createElement(l.Suspense,null,t(l).createElement(le,{items:p}))};b=i("ibYAx");var Ie=i("6AorB"),De=i("eQcMe"),Ne=i("5Doro"),je=i("8K6wD"),Re=i("GDiVM"),Le=(R=i("2LZGp"),i("jPDaF")),ze=i("a8kcR"),We=(M=i("h5kyv"),A=i("d1qx3"),i("8DCD7")),$e=i("bLLpR"),Ge=i("bcqzL");d.fileLogger.init({provider:$e.ClientFileLoggerProvider}),d.telemetry.init(),d.telemetry.setUser({id:M.analytics.getDeviceId()}),(0,We.initializeFeatureFlags)(),(0,m.reconcilePendingTransactions)(new(0,Le.LegacyIndexedDBProxy)),(0,m.addOnUpdateHandler)(((e,t)=>(0,m.updateMinedTransactionsHandler)(e,t,M.analytics))),(0,m.addOnRemoveHandler)(m.removeMinedTransactionsHandler);const Ve=()=>{(0,l.useEffect)((()=>{M.analytics.capture("popupOpen")}),[]);const e=(0,l.useCallback)((()=>{(0,A.openTabAsync)({url:"onboarding.html"}),window.close()}),[]);return t(l).createElement(t(l).Fragment,null,t(l).createElement(c.MemoryRouter,{future:{v7_startTransition:!0}},t(l).createElement(f.ThemeProvider,{theme:ze.theme},t(l).createElement(p.ThemeProvider,null,t(l).createElement(Ge.ThemedGlobalStyle,{backgroundColor:"#222222"}),t(l).createElement(h.PopupAndNotificationErrorBoundary,null,t(l).createElement(g.Main,{withBorder:!0},t(l).createElement(N,null,t(l).createElement(Ne.QueryProvider,null,t(l).createElement(Re.ExtensionLockWrapper,{openOnboarding:e},t(l).createElement(Ie.LegacyModalsProvider,null,t(l).createElement(R.Modals,null,t(l).createElement(je.SettingsMenuProvider,null,t(l).createElement(De.MenuProvider,null,t(l).createElement(Be,null)))))))),t(l).createElement("div",{id:b.MODAL_ID}),t(l).createElement(v.Toaster,null)))))))},He=document.getElementById("root");(0,o.createRoot)(He).render(t(l).createElement(Ve,null));
//# sourceMappingURL=popup.010d9867.js.map
define=__define;})(window.define);