(function(define){var __define;"function"==typeof define&&define.amd&&(__define=define,define=null);
!function(){function e(e){return e&&e.__esModule?e.default:e}function t(e,t,n,r){Object.defineProperty(e,t,{get:n,set:r,enumerable:!0,configurable:!0})}var n=("undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{}).parcelRequire1d24;n.register("3qeW6",(function(r,a){var o;o=r.exports,Object.defineProperty(o,"__esModule",{value:!0,configurable:!0}),t(r.exports,"default",(function(){return g}));var c=n("1fwzV"),i=n("lz5BI"),s=n("29o0l"),l=n("84vNm"),d=n("1wtq7"),u=n("bQfjx"),p=n("krk0C"),m=n("V2q0K"),h=n("3Kg4v");var g=()=>{var t;const{hardwareStepStack:n,pushStep:r,popStep:a,currentStep:o}=(0,m.useHardwareOnboardingStore)(),g=(0,l.default)(n,((e,t)=>(null==e?void 0:e.length)===t.length)),f=(0,s.useCallback)((()=>{var e,t,n,r,c;(null===(e=o())||void 0===e?void 0:e.props.preventBack)||((null===(t=o())||void 0===t?void 0:t.props.onBackCallback)&&(null===(c=null===(n=o())||void 0===n?void 0:(r=n.props).onBackCallback)||void 0===c||c.call(r)),a())}),[o,a]);(0,s.useEffect)((()=>{r(e(s).createElement(p.ConnectHardwareMultichain,null))}),[r]);const y=n.length>(null!=g?g:[]).length,w=0===(null==g?void 0:g.length),S={initial:{x:w?0:y?150:-150,opacity:w?1:0},animate:{x:0,opacity:1},exit:{opacity:0},transition:{duration:.2}};return e(s).createElement(d.ConnectHardwareContainer,null,e(s).createElement(u.StepHeader,{totalSteps:h.TOTAL_CONNECT_HARDWARE_STEPS,onBackClick:f,showBackButton:!(null===(t=o())||void 0===t?void 0:t.props.preventBack),currentStepIndex:n.length-1}),e(s).createElement(c.AnimatePresence,{mode:"wait"},e(s).createElement(i.motion.div,Object.assign({style:{display:"flex",flexGrow:1},key:`${n.length}_${null==g?void 0:g.length}`},S),o())))}})),n.register("1wtq7",(function(e,r){t(e.exports,"ConnectHardwareContainer",(function(){return a}));const a=n("gkfw3").default.main`
  width: 400px;
  min-height: 450px;
  background-color: #222222;
  border: 1px solid #323232;
  box-shadow: 0px 10px 20px rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`})),n.register("bQfjx",(function(r,a){t(r.exports,"StepHeader",(function(){return g}));var o=n("RVqnc"),c=n("29o0l"),i=n("gkfw3"),s=n("lSd3H"),l=n("6UMd8"),d=n("j81qC"),u=n("634r8");const p=(0,i.default)(u.Row).attrs({justify:"space-between"})`
  background-color: #222222;
  padding: 10px 16px;
  border-bottom: 1px solid #323232;
  height: 46px;
  opacity: ${e=>{var t;return null!==(t=e.opacity)&&void 0!==t?t:"1"}};
`,m=i.default.div`
  display: flex;
  margin-left: 10px;
  > * {
    margin-right: 10px;
  }
`,h=i.default.div`
  width: 24px;
  height: 24px;
`,g=({onBackClick:t,totalSteps:n,currentStepIndex:r,isHidden:a,showBackButtonOnFirstStep:i,showBackButton:u=!0})=>{const g=u&&(i||0!==r);return e(c).createElement(p,{opacity:a?0:1},g?e(c).createElement(s.ChevronCircle,{right:1,onClick:t},e(c).createElement(d.IconChevronLeft,null)):e(c).createElement(h,null),e(c).createElement(m,null,(0,o.range)(n).map((t=>{const n=t<=r?"#AB9FF2":"#333";return e(c).createElement(l.Circle,{key:t,diameter:12,color:n})}))),e(c).createElement(h,null))}})),n.register("lSd3H",(function(e,r){t(e.exports,"ChevronCircle",(function(){return c}));var a=n("gkfw3"),o=n("6UMd8");const c=(0,a.default)(o.Circle)`
  cursor: pointer;
  width: 24px;
  height: 24px;
  transition: background-color 200ms ease;
  background-color: ${e=>e.$isExpanded?"#000":"#333"} !important;
  :hover {
    background-color: #444444;
    svg {
      fill: white;
    }
  }
  svg {
    fill: ${e=>e.$isExpanded?"white":"#666666"};
    transition: fill 200ms ease;
    position: relative;
    ${e=>e.top?`top: ${e.top}px;`:""}
    ${e=>e.right?`right: ${e.right}px;`:""}
  }
`})),n.register("krk0C",(function(r,a){t(r.exports,"ConnectHardwareMultichain",(function(){return v}));var o=n("iOvk1"),c=n("3ljHn"),i=n("43063"),s=n("29o0l"),l=n("9CoSy"),d=n("gX5Te"),u=n("hFkH3"),p=n("cb8KS"),m=n("kFW5d"),h=n("3mrWC"),g=n("j81qC"),f=n("bhnmm"),y=n("efSU2"),w=n("ivB1q"),S=n("V2q0K");const x=()=>{(0,c.usePrefetchFeatureFlagsEffect)();const t=(0,S.useHardwareOnboardingStore)((e=>e.pushStep)),n=(0,S.useHardwareOnboardingStore)((e=>e.setSelectedChains)),{t:r}=(0,i.useTranslation)(),a=d.hooks.useEnabledNetworkIDs(),g=d.hooks.useEnabledAddressTypes(),{data:x,isFetching:v,refetch:C}=d.hooks.useRequestLedgerPermission(!0,!0),{buttonDisabled:b,defaultIcon:T,primaryText:E,secondaryText:k,buttonText:A,iconType:H,onClick:I}=(0,s.useMemo)((()=>{var c,i;let d=!1;const u=e(s).createElement(f.SpinnerIcon,null);let m,h,S,b=p.ConfirmationIconType.Default,T=l.NOOP;if(v)m=r("connectHardwareSearching"),h=r("connectHardwareMakeSureConnected"),S=r("commandContinue"),d=!0;else if("granted"===(null==x?void 0:x.type)){const l=null!==(i=null===(c=x.transport.deviceModel)||void 0===c?void 0:c.productName)&&void 0!==i?i:"Ledger";b=p.ConfirmationIconType.Success,m=r("connectHardwarePairSuccessPrimary",{productName:l}),h=r("connectHardwarePairSuccessSecondary",{productName:l}),S=r("commandContinue"),d=!1,T=()=>{if(1===g.length){const r=new Map;r.set(g[0],{});for(const e of a){const t=o.Chains.getAddressTypes(e);for(const n of t)r.set(n,{[e]:!0})}n(g,r),t(e(s).createElement(y.ConnectHardwareMultichainOpenApp,{preventBack:!0}))}else t(e(s).createElement(w.ConnectHardwareMultichainSelectChain,{onBackCallback:()=>{n([],new Map)}}))}}else"denied"===(null==x?void 0:x.type)?(b=p.ConfirmationIconType.Failure,m=r("connectHardwarePermissionDeniedPrimary"),h=r("connectHardwarePermissionDeniedSecondary"),S=r("commandTryAgain"),d=!1,T=C):x&&"unable-to-connect"!==x.type||(b=p.ConfirmationIconType.Failure,m=r("connectHardwarePermissionUnableToConnect"),h=r("connectHardwareWaitingForApplicationSecondaryText"),S=r("commandTryAgain"),d=!1,T=C);return{buttonDisabled:d,defaultIcon:u,primaryText:m,secondaryText:h,buttonText:S,iconType:b,onClick:T}}),[a,g,x,t,C,v,n,r]);return e(s).createElement(m.ConnectHardwareStepContainer,null,e(s).createElement(h.IconHeader,{icon:e(s).createElement(p.ConfirmationIcon,{defaultIcon:T,type:H}),primaryText:E,headerStyle:h.IconHeaderStyle.Large,secondaryText:k}),e(s).createElement(u.Button,{onClick:I,theme:"primary",disabled:b},A))},v=()=>{const{pushSubStep:t}=(0,S.useHardwareOnboardingStore)(),{t:n}=(0,i.useTranslation)();return e(s).createElement(m.ConnectHardwareStepContainer,null,e(s).createElement(h.IconHeader,{icon:e(s).createElement(g.IconLedgerLogo,null),primaryText:n("connectHardwareLedger"),headerStyle:h.IconHeaderStyle.Large,secondaryText:n("connectHardwareStartConnection"),animateText:!0}),e(s).createElement(u.Button,{onClick:()=>{t(e(s).createElement(x,null))},theme:"primary"},n("commandConnect")))}})),n.register("cb8KS",(function(r,a){t(r.exports,"ConfirmationIconType",(function(){return h})),t(r.exports,"ConfirmationIcon",(function(){return f}));var o=n("1fwzV"),c=n("lz5BI"),i=n("29o0l"),s=n("gkfw3"),l=n("6UMd8"),d=n("j81qC");const u=s.default.div`
  position: relative;
`,p=(0,s.default)(c.motion.div)`
  width: ${e=>e.width}px;
  height: ${e=>e.width}px;
`,m=(0,s.default)(c.motion.div)`
  top: 0;
  width: 100%;
  height: 100%;
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
`;var h,g;(g=h||(h={})).Default="default",g.Warning="warning",g.Failure="failure",g.Success="success";const f=({type:t,iconWidth:n,defaultIcon:r,backgroundWidth:a=94})=>e(i).createElement(u,null,e(i).createElement(o.AnimatePresence,{mode:"wait",initial:!1},e(i).createElement(p,{width:a,key:t,initial:{opacity:0},animate:{opacity:1},exit:{opacity:0},transition:{duration:.2}},(()=>{switch(t){case h.Default:return e(i).createElement(l.Circle,{diameter:a,color:"#181818",includeDarkBoxShadow:!0});case h.Warning:return e(i).createElement(l.Circle,{diameter:a,color:"#FFDC62",opacity:.1});case h.Failure:return e(i).createElement(l.Circle,{diameter:a,color:"#EB3742",opacity:.1});case h.Success:return e(i).createElement(l.Circle,{diameter:a,color:"#21E56F",opacity:.1})}})())),e(i).createElement(o.AnimatePresence,{mode:"wait",initial:!0},e(i).createElement(m,{key:t,initial:{opacity:0,y:10},animate:{opacity:1,y:0},exit:{opacity:0,y:10},transition:{duration:.4,bounce:.4,type:"spring"}},(()=>{switch(t){case h.Default:return null!=r?r:e(i).createElement(d.IconQuestionMark,{width:null!=n?n:30});case h.Warning:return e(i).createElement(d.IconExclamationMarkCircle,{width:40,height:40,circleFill:"#FFDC62",exclamationFill:"#00000000"});case h.Failure:return e(i).createElement(d.IconFailure,{width:null!=n?n:30});case h.Success:return e(i).createElement(d.IconCheckmark,{height:"100%",width:null!=n?n:40,fill:"#21E56F"})}})())))})),n.register("kFW5d",(function(e,r){t(e.exports,"ConnectHardwareStepContainer",(function(){return a}));const a=n("gkfw3").default.div`
  padding: 55px 20px 20px;
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
  overflow: auto;
`})),n.register("3mrWC",(function(r,a){t(r.exports,"IconHeaderStyle",(function(){return f})),t(r.exports,"IconHeader",(function(){return v}));var o=n("29o0l"),c=n("gkfw3"),i=n("91Dw6"),s=n("j81qC"),l=n("27SDj");const d=c.default.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`,u=c.keyframes`
  0% {
    top: 15px;
    opacity: 0;
  };
  100% {
    top: 0px;
    opacity: 1;
  };
`,p=c.default.div`
  animation-name: ${e=>e.animateText?u:"none"};
  animation-duration: ${e=>e.animateText?".5s":"0s"};
  position: relative;
`,m=(0,c.default)(l.Text)`
  margin: ${e=>e.margin};
`;m.defaultProps={margin:"20px auto 0 auto"};const h=(0,c.default)(l.Text)`
  margin: ${e=>e.margin};
`;h.defaultProps={margin:"15px 0px 0px 0px"};const g=c.default.div`
  position: relative;
  left: 38px;
  bottom: 22px;
`;var f,y;(y=f||(f={})).Medium="medium",y.Large="large",y.Small="small";const w={[f.Large]:30,[f.Medium]:28,[f.Small]:24},S={[f.Large]:34,[f.Medium]:34,[f.Small]:29},x={[f.Large]:18,[f.Medium]:16,[f.Small]:14},v=({className:t,icon:n,primaryText:r,secondaryText:a,headerStyle:c,showWarning:l=!1,showError:u=!1,animateText:y=!1})=>{c=null!=c?c:f.Medium;const v=w[c],C=S[c],b=x[c],T={[f.Large]:22,[f.Medium]:19,[f.Small]:17}[c],E="small"===c?"16px 0 0 0":void 0,k=u?i.ERROR_COLOR:"#777777";return e(o).createElement(d,{className:t},null!=n?n:e(o).createElement(s.IconUnknownOrigin,null),l?e(o).createElement(g,null,e(o).createElement(s.IconExclamationMarkCircle,null)):e(o).createElement(e(o).Fragment,null),e(o).createElement(p,{animateText:y},r&&e(o).createElement(m,{margin:E,weight:500,size:v,lineHeight:C,maxWidth:"320px"},r),a&&e(o).createElement(h,{margin:E,wordBreak:"break-word",size:b,lineHeight:T,color:k},a)))};v.defaultProps={headerStyle:f.Medium}})),n.register("91Dw6",(function(e,n){t(e.exports,"WARNING_COLOR",(function(){return r})),t(e.exports,"DANGER_COLOR",(function(){return a})),t(e.exports,"ERROR_COLOR",(function(){return o}));const r="#FFDC62",a="#EB3742",o="#eb3742"})),n.register("efSU2",(function(r,a){t(r.exports,"ConnectHardwareMultichainOpenApp",(function(){return O}),(function(e){return O=e}));var o=n("4xbAj"),c=n("jZpRu"),i=n("iOvk1"),s=n("3ljHn"),l=n("eJxop"),d=n("43063"),u=n("7mQ3Y"),p=n("g9PKp"),m=n("29o0l"),h=n("gkfw3"),g=n("creZv"),f=n("gX5Te"),y=n("gcdBN"),w=n("hFkH3"),S=n("cGJ3C"),x=n("cb8KS"),v=n("kFW5d"),C=n("3mrWC"),b=n("bhnmm"),T=n("27SDj"),E=n("6NY04"),k=n("V2q0K"),A=function(e,t,n,r){return new(n||(n=Promise))((function(a,o){function c(e){try{s(r.next(e))}catch(e){o(e)}}function i(e){try{s(r.throw(e))}catch(e){o(e)}}function s(e){var t;e.done?a(e.value):(t=e.value,t instanceof n?t:new n((function(e){e(t)}))).then(c,i)}s((r=r.apply(e,t||[])).next())}))};const H=h.default.div`
  align-self: center;
  background-color: rgba(255, 255, 255, 0.03);
  border-radius: 80px;
  padding: 8px 16px;
  max-width: 150px;
`,I=h.default.div`
  display: flex;

  svg {
    position: relative;

    :first-child {
      left: ${e=>e.logoCount>1?"12.5px":0};
    }

    :nth-child(2) {
      left: ${e=>e.logoCount>1?"-12.5px":0};
    }
  }
`,O=()=>{const t=(0,k.useHardwareOnboardingStore)((e=>e.chainImportStep)),n=(0,k.useHardwareOnboardingStore)((e=>e.setIncrementChainImportStep)),r=(0,k.useHardwareOnboardingStore)((e=>e.selectedChains)),a=(0,k.useHardwareOnboardingStore)((e=>e.selectedChainsMap)),h=(0,k.useHardwareOnboardingStore)((e=>e.pushStep)),D=(0,k.useHardwareOnboardingStore)((e=>e.pushSubStep)),B=(0,k.useHardwareOnboardingStore)((e=>e.setDiscoveredAccounts)),M=(0,k.useHardwareOnboardingStore)((e=>e.setDerivedAccountGroups)),P=(0,m.useRef)(k.useHardwareOnboardingStore.getState().derivedAccountGroups),{t:j,i18n:L}=(0,d.useTranslation)(),N=r[t-1],{data:F=[],isFetched:R,isError:W}=f.hooks.useAllMultiChainAccounts(),[$,K]=(0,m.useState)(!1),_=(0,m.useMemo)((()=>{const e=[],t=a.get(N)||{};for(const[n,r]of Object.entries(t))r&&e.push(n);return e}),[N,a]),{chainNameTextOr:q,chainNameTextAnd:V}=(0,m.useMemo)((()=>{const e=_.map((e=>i.Chains.getChainName(e))),t=new Intl.ListFormat(L.resolvedLanguage,{style:"long",type:"disjunction"}),n=new Intl.ListFormat(L.resolvedLanguage,{style:"long",type:"conjunction"});return{chainNameTextOr:t.format(e),chainNameTextAnd:n.format(e)}}),[_,L]),G=(0,m.useMemo)((()=>_.map((t=>e(m).createElement(S.ChainLogo,{key:t,networkID:t,width:90,height:90,strokeWidth:1})))),[_]);(0,m.useEffect)((()=>{const e=k.useHardwareOnboardingStore.subscribe((e=>P.current=e.derivedAccountGroups));return()=>e()}),[]);const U=(0,m.useMemo)((()=>{const e=[];switch(N){case u.AddressType.Solana:e.push({pathType:c.DerivationPathType.Bip44RootSolana});break;case u.AddressType.EVM:e.push({pathType:c.DerivationPathType.Bip44RootEthereum});case u.AddressType.BitcoinTaproot:case u.AddressType.BitcoinNativeSegwit:case u.AddressType.BitcoinNestedSegwit:case u.AddressType.BitcoinLegacy:}for(let t=0;t<19;++t)switch(N){case u.AddressType.Solana:e.push({index:t,pathType:c.DerivationPathType.Bip44ChangeSolana}),e.push({index:t,pathType:c.DerivationPathType.Bip44Solana});break;case u.AddressType.EVM:e.push({index:t,pathType:c.DerivationPathType.Bip44Ethereum}),e.push({index:t,pathType:c.DerivationPathType.Bip44EthereumSecondary});break;case u.AddressType.BitcoinTaproot:case u.AddressType.BitcoinNativeSegwit:case u.AddressType.BitcoinNestedSegwit:case u.AddressType.BitcoinLegacy:e.push({index:t,pathType:c.DerivationPathType.BitcoinTaproot},{index:t,pathType:c.DerivationPathType.BitcoinNativeSegwit})}return e}),[N]),[z,Q]=(0,m.useState)(!0),{data:Y=l.LEDGER_NOT_CONNECTED_STATE}=f.hooks.useLedgerWireTransportState(z,!0),{data:[Z]}=(0,s.useFeatureFlags)(["kill-ledger-xpub-derivation"]),{data:J,error:X,fetchStatus:ee,refetch:te}=f.hooks.useLedgerAddresses(Y,U,!0,!Z),ne="fetching"===ee,re=!Y.isConnected&&"reconnecting"!==Y.status,[ae,oe]=(0,m.useState)(!1),{data:ce,refetch:ie}=f.hooks.useRequestLedgerPermission(ae,!0);(0,m.useEffect)((()=>{re&&Q(!1)}),[re]),(0,m.useEffect)((()=>{"granted"===(null==ce?void 0:ce.type)&&(Q(!0),oe(!1))}),[ce]);const se=(0,m.useCallback)((()=>A(void 0,void 0,void 0,(function*(){var n;if(J&&Object.keys(J).length){const a=[...P.current];let c=0;for(const e of Object.values(J)){const t=null!==(n=a[c])&&void 0!==n?n:{accounts:{}},r={accounts:Object.assign({},t.accounts),derivationIndex:U[c].index};switch(e.addressType){case u.AddressType.EVM:_.includes(i.NetworkIDs.Polygon.Mainnet)&&(r.accounts[`${i.NetworkIDs.Polygon.Mainnet}-${e.address}`]={chainType:e.addressType,chainId:i.NetworkIDs.Polygon.Mainnet,address:e.address,publicKey:e.publicKey,pathParams:U[c]}),_.includes(i.NetworkIDs.Ethereum.Mainnet)&&(r.accounts[`${i.NetworkIDs.Ethereum.Mainnet}-${e.address}`]={chainType:e.addressType,chainId:i.NetworkIDs.Ethereum.Mainnet,address:e.address,publicKey:e.publicKey,pathParams:U[c]});break;case u.AddressType.Solana:r.accounts[`${i.NetworkIDs.Solana.Mainnet}-${e.address}`]={chainType:e.addressType,address:e.address,publicKey:e.publicKey,chainId:i.NetworkIDs.Solana.Mainnet,pathParams:U[c]};break;case u.AddressType.BitcoinTaproot:case u.AddressType.BitcoinNativeSegwit:case u.AddressType.BitcoinNestedSegwit:case u.AddressType.BitcoinLegacy:r.accounts[`${i.NetworkIDs.Bitcoin.Mainnet}-${e.address}`]={chainType:e.addressType,address:e.address,publicKey:e.publicKey,chainId:i.NetworkIDs.Bitcoin.Mainnet,pathParams:U[c]}}a[c]=r,c++}if(M(a),R&&r.length===t){K(!0);const t=(e=>{const t=new Set;for(const n of e)for(const{address:e}of n.addresses)t.add(e);return t})(F),n=a.reduce(((e,n)=>{let r=!1;for(const{address:e}of Object.values(n.accounts))r=r||t.has(e);return r||e.push(n),e}),[]),r=[],c=[];for(let e=0;e<n.length;e+=p.BATCH_SIZE_BY_PLATFORM.extension){const t=n.slice(e,e+p.BATCH_SIZE_BY_PLATFORM.extension).map((e=>Object.entries(e.accounts).reduce(((e,[t,n])=>(e[t]={account:n},e)),{})));c.push(t)}for(const e of c)r.push((0,p.discoverAccounts)(e));const i=(yield Promise.all(r)).flat().map((e=>{switch(e.status){case"discovered":return Object.assign(Object.assign({},e),{accounts:e.accounts.filter((e=>e.hasAccountActivity||(0,o.isRecommendedDerivationPathType)(e.derivationPathType)))});case"undiscovered":return Object.assign(Object.assign({},e),{accounts:e.accounts.filter((e=>(0,o.isRecommendedDerivationPathType)(e.derivationPathType)))})}})).filter((e=>e.accounts.length>0)).map((e=>{const t=(0,g.default)();return Object.assign(Object.assign({},e),{discoveryIdentifier:t})})),s=i.filter((e=>"undiscovered"===e.status||e.isSelectedByDefault)),l=i.filter((e=>!("undiscovered"===e.status||e.isSelectedByDefault))).slice(0,2),d=s.length>0,u=F.filter((e=>e.type===o.AccountType.Ledger)).length,f=(d?[...s,...l]:i.filter((e=>!e.accounts.some((e=>!(0,o.isRecommendedDerivationPathType)(e.derivationPathType))))).slice(0,3)).map(((e,t)=>Object.assign(Object.assign({},e),{accountIndex:u+t})));B(f,d),h(e(m).createElement(E.ConnectHardwareMultichainImportAccount,{preventBack:!0}))}}}))),[J,M,R,r.length,t,U,_,F,B,h]);let le,de,ue,pe;(0,m.useEffect)((()=>{J&&Object.keys(J).length===U.length&&(se(),r.length!==t&&(n(),D(e(m).createElement(O,{preventBack:!0}))))}),[J,U,h,D,t,r,se,n]);let me=()=>{};return W?(le=e(m).createElement(x.ConfirmationIcon,{type:x.ConfirmationIconType.Failure}),de=j("connectHardwareErrorLedgerGeneric"),ue=j("connectHardwareErrorLedgerPhantomLocked"),me=()=>A(void 0,void 0,void 0,(function*(){const e=yield(0,y.getCurrentTabAsync)();void 0!==e.id&&(0,y.closeTabAsync)(e.id)})),pe=j("commandClose")):ce&&"granted"!==ce.type?(le=e(m).createElement(x.ConfirmationIcon,{type:x.ConfirmationIconType.Warning}),de=j("connectHardwarePermissionDeniedPrimary"),ue=j("connectHardwarePermissionDeniedSecondary"),pe=j("homeErrorButtonText"),me=ie):re?(le=e(m).createElement(x.ConfirmationIcon,{type:x.ConfirmationIconType.Warning}),de=j("connectHardwarePermissionUnableToConnect"),ue=j("connectHardwarePermissionUnableToConnectDescription"),pe=j("commandConnect"),me=ie):X instanceof l.LedgerLockedError?(le=e(m).createElement(x.ConfirmationIcon,{type:x.ConfirmationIconType.Failure}),de=j("connectHardwareErrorLedgerLocked"),ue=j("connectHardwareErrorLedgerLockedDescription"),pe=j("homeErrorButtonText"),me=te):X?(le=e(m).createElement(x.ConfirmationIcon,{type:x.ConfirmationIconType.Failure}),de=j("connectHardwareErrorLedgerGeneric"),ue=j("connectHardwareErrorLedgerGenericDescription"),pe=j("homeErrorButtonText"),me=te):"reconnecting"==Y.status?(le=e(m).createElement(x.ConfirmationIcon,{defaultIcon:e(m).createElement(b.SpinnerIcon,null),type:x.ConfirmationIconType.Default}),de=j("connectHardwareConnecting"),ue=j("connectHardwareConnectingDescription")):$?(le=e(m).createElement(x.ConfirmationIcon,{defaultIcon:e(m).createElement(b.SpinnerIcon,null),type:x.ConfirmationIconType.Default}),de=j("connectHardwareDiscoveringAccounts"),ue=j("connectHardwareDiscoveringAccountsDescription")):ne?(le=e(m).createElement(x.ConfirmationIcon,{defaultIcon:e(m).createElement(b.SpinnerIcon,null),type:x.ConfirmationIconType.Default}),de=j("connectHardwareConnectingAccounts"),ue=j("connectHardwareFindingAccountsWithActivity",{chainName:V})):(le=e(m).createElement(I,{logoCount:G.length},G),de=j("connectHardwareOpenAppInterpolated",{app:q}),ue=j("connectHardwareOpenAppDescription")),e(m).createElement(v.ConnectHardwareStepContainer,null,e(m).createElement(C.IconHeader,{icon:le,primaryText:de,headerStyle:C.IconHeaderStyle.Large,secondaryText:ue}),pe?e(m).createElement(w.Button,{onClick:me,theme:"primary"},pe):e(m).createElement(H,null,e(m).createElement(T.Text,{color:"#999999",size:14},j("connectHardwareAccountsStepOfSteps",{stepNum:t,totalSteps:r.length}))))}})),n.register("6NY04",(function(r,a){t(r.exports,"ConnectHardwareMultichainImportAccount",(function(){return y}));var o=n("43063"),c=n("29o0l"),i=n("gkfw3"),s=n("hFkH3"),l=n("cb8KS"),d=n("kFW5d"),u=n("3mrWC"),p=n("2QUtj"),m=n("eNcWQ"),h=n("V2q0K");const g=i.default.div`
  margin-bottom: 35px;
`,f=(0,i.default)(s.Button)`
  margin-bottom: 10px;
`,y=()=>{const t=(0,h.useHardwareOnboardingStore)((e=>e.discoveredAccounts)),n=(0,h.useHardwareOnboardingStore)((e=>e.activeAccountsFound)),r=(0,h.useHardwareOnboardingStore)((e=>e.setSelectedAccounts)),a=(0,h.useHardwareOnboardingStore)((e=>e.pushSubStep)),{t:i}=(0,o.useTranslation)(),y=(0,c.useMemo)((()=>{let e;if(n){const n=t.filter((e=>"undiscovered"===e.status||e.isSelectedByDefault));e=i(1===n.length?"connectHardwareFoundAccountsWithActivitySingular":"connectHardwareFoundAccountsWithActivity",{numOfAccounts:n.length})}else e=i("connectHardwareFoundSomeAccounts");return e}),[n,i,t]),w=(0,c.useCallback)((()=>{a(e(c).createElement(m.ConnectHardwareMultichainSelectAccounts,{activeAccounts:t}))}),[a,t]),S=(0,c.useCallback)((()=>{a(e(c).createElement(p.ConnectHardwareMultichainImportConfirmation,{preventBack:!0}))}),[a]);return(0,c.useEffect)((()=>{const e=t.reduce(((e,t,n)=>(("discovered"===t.status&&t.isSelectedByDefault||0===n)&&(e[t.discoveryIdentifier]=!0),e)),{});r(e)}),[t,r,n,i]),e(c).createElement(d.ConnectHardwareStepContainer,null,e(c).createElement(g,null,e(c).createElement(u.IconHeader,{icon:e(c).createElement(l.ConfirmationIcon,{type:l.ConfirmationIconType.Success}),primaryText:i("connectHardwareConnectAccounts"),headerStyle:u.IconHeaderStyle.Large,secondaryText:y})),e(c).createElement(f,{onClick:w,theme:"default"},i("connectHardwareSelectAccounts")),e(c).createElement(s.Button,{onClick:S,theme:"primary"},i("commandContinue")))}})),n.register("2QUtj",(function(r,a){t(r.exports,"ConnectHardwareMultichainImportConfirmation",(function(){return h}));var o=n("jZpRu"),c=n("43063"),i=n("29o0l"),s=n("gX5Te"),l=n("hFkH3"),d=n("cb8KS"),u=n("kFW5d"),p=n("3mrWC"),m=n("V2q0K");const h=()=>{const t=(0,m.useHardwareOnboardingStore)((e=>e.discoveredAccounts)),n=(0,m.useHardwareOnboardingStore)((e=>e.selectedAccounts)),{t:r}=(0,c.useTranslation)(),{mutateAsync:a}=s.hooks.useConnectLedgerAccounts(),{mutateAsync:h}=s.hooks.useUpdateVisibleBitcoinAddressTypes(),[g,f]=(0,i.useState)(!1),y=(0,i.useMemo)((()=>t.filter((e=>!!n[e.discoveryIdentifier]))),[t,n]);return(0,i.useEffect)((()=>{if(y.length){const e=[],t=new Set;for(const n of y){const{accounts:r,seedIndex:a,accountIndex:c}=n,i=[],s=[];for(const e of r)(0,o.isBitcoinDerivationPathType)(e.derivationPathType)?(s.push({pathType:e.derivationPathType,value:e.publicKey}),"amount"in e&&0===parseFloat(e.amount)||t.add(e.chainType)):((0,o.isEVMDerivationPathType)(e.derivationPathType)||(0,o.isSolanaDerivationPathType)(e.derivationPathType))&&i.push({pathType:e.derivationPathType,value:e.address});e.push({derivationIndex:a,addresses:i,publicKeys:s,accountIndex:c})}a({accounts:e}).then((()=>{t.size>0&&h({addressTypes:Array.from(t)})})).finally((()=>f(!0)))}else f(!0)}),[y,a,h]),e(i).createElement(u.ConnectHardwareStepContainer,null,e(i).createElement(p.IconHeader,{icon:e(i).createElement(d.ConfirmationIcon,{type:d.ConfirmationIconType.Success}),primaryText:r("connectHardwareAccountsAddedInterpolated",{numOfAccounts:y.length}),headerStyle:p.IconHeaderStyle.Large,secondaryText:r("connectHardwareFinishSecondaryText")}),e(i).createElement(l.Button,{onClick:()=>{window.close()},theme:"primary",disabled:!g},r("pastParticipleDone")))}})),n.register("V2q0K",(function(r,a){t(r.exports,"useHardwareOnboardingStore",(function(){return l}));var o=n("RVqnc"),c=n("1I4L6"),i=n("gTwcH");const s={hardwareStepStack:[],hardwareStepSubStack:{},selectedChains:[],selectedChainsMap:new Map,chainImportStep:1,derivedAccountGroups:[],discoveredAccounts:[],activeAccountsFound:!1,selectedAccounts:{}},l=e(i)(((e,t)=>Object.assign(Object.assign({},s),{pushStep:n=>{const r=t().hardwareStepStack;e({hardwareStepStack:r.concat(n)})},popStep:()=>{var n;const r=t().hardwareStepStack.length-1;if((null!==(n=t().hardwareStepSubStack[r])&&void 0!==n?n:[]).length)return e((0,c.default)((e=>{e.hardwareStepSubStack[r]=e.hardwareStepSubStack[r].slice(0,-1)})));e((0,c.default)((e=>{e.hardwareStepStack=e.hardwareStepStack.slice(0,-1)})))},pushSubStep:n=>{var r;const a=t().hardwareStepStack.length-1,o=null!==(r=t().hardwareStepSubStack[a])&&void 0!==r?r:[];e((0,c.default)((e=>{e.hardwareStepSubStack[a]=o.concat([n])})))},currentStep:()=>{var e;const n=t().hardwareStepStack,r=t().hardwareStepSubStack,a=n.length>0?n.length-1:n.length;return(null===(e=r[a])||void 0===e?void 0:e.length)?(0,o.getLast)(r[a]):(0,o.getLast)(n)},setSelectedChains:(t,n)=>{e({selectedChains:t,selectedChainsMap:n})},setDecrementChainImportStep:()=>{const n=t().chainImportStep;e({chainImportStep:n-1})},setIncrementChainImportStep:()=>{const n=t().chainImportStep;e({chainImportStep:n+1})},setDerivedAccountGroups:t=>{e({derivedAccountGroups:t})},setDiscoveredAccounts:(t,n)=>{e({discoveredAccounts:t,activeAccountsFound:n})},selectAccount:n=>{const r=t().selectedAccounts,a=Object.assign({},r);a[n]=!0,e({selectedAccounts:a})},deselectAccount:n=>{const r=t().selectedAccounts,a=Object.assign({},r);delete a[n],e({selectedAccounts:a})},setSelectedAccounts:t=>{e({selectedAccounts:t})}})))})),n.register("eNcWQ",(function(r,a){t(r.exports,"ConnectHardwareMultichainSelectAccounts",(function(){return g}));var o=n("43063"),c=n("29o0l"),i=n("gkfw3"),s=n("j1Q6i"),l=n("hFkH3"),d=n("kFW5d"),u=n("27SDj"),p=n("2QUtj"),m=n("V2q0K");const h=(0,i.default)(u.Text)`
  margin-top: 15px;
`,g=({activeAccounts:t})=>{const n=(0,m.useHardwareOnboardingStore)((e=>e.selectedAccounts)),r=(0,m.useHardwareOnboardingStore)((e=>e.selectAccount)),a=(0,m.useHardwareOnboardingStore)((e=>e.deselectAccount)),i=(0,m.useHardwareOnboardingStore)((e=>e.pushSubStep)),{t:g}=(0,o.useTranslation)(),f=(0,c.useMemo)((()=>0===Object.values(n).filter((e=>!!e)).length),[n]),y=(0,c.useCallback)((()=>{i(e(c).createElement(p.ConnectHardwareMultichainImportConfirmation,{preventBack:!0}))}),[i]);return e(c).createElement(d.ConnectHardwareStepContainer,null,e(c).createElement("div",{style:{marginBottom:15}},e(c).createElement("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:30}},e(c).createElement(u.Text,{weight:500,size:30,lineHeight:34,maxWidth:"320px"},g("connectHardwareSelectAccounts")),e(c).createElement(h,{wordBreak:"break-word",size:18,lineHeight:22,color:"#777777"},g("connectHardwareChooseAccountsToConnect"))),e(c).createElement("div",{style:{maxHeight:420,overflowY:"scroll"}},t.map((({accounts:t,discoveryIdentifier:o,accountIndex:i})=>{const l=!!n[o];return e(c).createElement(s.DiscoveredAccountRow,{key:o,accountType:"ledger",accounts:t,accountIndex:i,checked:l,onPress:()=>{l?a(o):r(o)}})})))),e(c).createElement(l.Button,{onClick:y,theme:"primary",disabled:f},g("commandContinue")))}})),n.register("j1Q6i",(function(r,a){t(r.exports,"DiscoveredAccountRow",(function(){return f}));var o=n("4xbAj"),c=n("43063"),i=n("RVqnc"),s=n("29o0l"),l=n("Nt4tV"),d=n("gkfw3"),u=n("cGJ3C"),p=n("lLNMU"),m=n("7bRVh"),h=n("27SDj");const g=({account:t})=>{const{t:n}=(0,c.useTranslation)();return e(s).createElement(b,null,e(s).createElement(w,null,e(s).createElement(u.ChainLogo,{networkID:t.chain.id,height:40,width:40,spacing:"large"})),e(s).createElement(S,null,e(s).createElement(v,null,e(s).createElement(m.TokenNameBadge,{networkID:t.chain.id,walletAddress:t.address},e(s).createElement(T,null,t.chain.name)),e(s).createElement(T,null,(0,o.formatHashMedium)(t.address,4))),e(s).createElement(x,null,"amount"in t&&"chain"in t?e(s).createElement(E,null,(0,l.formatTokenAmount)(t.amount)," ",t.chain.symbol):null,"amount"in t?e(s).createElement(E,null,t.lastActivityTimestamp?n("onboardingImportAccountsLastActive",{formattedTimestamp:(0,i.formatTimestampFromNow)(1e3*t.lastActivityTimestamp,!0)}):n("onboardingImportAccountsCreateNew")):null)))},f=e(s).memo((({accountType:t,accounts:n,checked:r,accountIndex:a,onPress:o})=>{const{t:i}=(0,c.useTranslation)(),l=a+1;return e(s).createElement(y,null,e(s).createElement(C,null,e(s).createElement(T,null,((e,t,n)=>{switch(t){case"seed":return e("onboardingImportAccountsAccountName",{walletIndex:n});case"ledger":return e("onboardingImportAccountsLedgerAccountName",{walletIndex:n})}})(i,t,l)),e(s).createElement(p.Checkbox,{checked:r,onChange:o})),n.map(((t,n)=>e(s).createElement(g,{key:`${t.address}-${n}`,account:t}))))})),y=d.default.div`
  margin-bottom: 24px;
  width: 100%;
`,w=d.default.div`
  flex-shrink: 0;
  margin-right: 10px;
`,S=d.default.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`,x=d.default.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`,v=(0,d.default)(x)`
  margin-bottom: 2px;
`,C=(0,d.default)(x)`
  background: #2a2a2a;
  margin-bottom: 1px;
  padding: 12px 16px 12px 14px;
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;

  & > span {
    margin-right: 0;
  }
`,b=d.default.div`
  background: #2a2a2a;
  margin-top: 1px;
  padding: 17px 16px 17px 14px;
  width: 100%;
  display: flex;
  align-items: center;

  &:last-of-type {
    border-bottom-left-radius: 6px;
    border-bottom-right-radius: 6px;
  }
`,T=(0,d.default)(h.Text).attrs({size:16,lineHeight:19,weight:600})``,E=(0,d.default)(h.Text).attrs({size:14,lineHeight:17,weight:400,color:"#777777"})``})),n.register("ivB1q",(function(r,a){t(r.exports,"ConnectHardwareMultichainSelectChain",(function(){return b}));var o=n("iOvk1"),c=n("43063"),i=n("29o0l"),s=n("gkfw3"),l=n("gX5Te"),d=n("cI6uH"),u=n("hFkH3"),p=n("cGJ3C"),m=n("lLNMU"),h=n("kFW5d"),g=n("27SDj"),f=n("efSU2"),y=n("V2q0K");const w=s.default.div`
  align-items: center;
  background-color: #2a2a2a;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 16px 24px 16px 12px;

  :last-child {
    margin-bottom: 28px;
  }

  > span {
    margin-right: 0px;
  }
`,S=s.default.div`
  margin-right: 12px;
`,x=s.default.div`
  margin-top: 30px;
`,v=s.default.div`
  display: flex;
  align-items: center;
`,C=({networkID:t,icon:n,onPressChain:r,isChecked:a})=>e(i).createElement(w,{onClick:()=>{r(t)}},e(i).createElement(v,null,e(i).createElement(S,null,n),e(i).createElement(g.Text,{size:16,weight:600},o.Chains.getNetworkName(t))),e(i).createElement(m.Checkbox,{checked:a})),b=()=>{const{pushSubStep:t,selectedChains:n,setSelectedChains:r,selectedChainsMap:a}=(0,y.useHardwareOnboardingStore)(),{t:s}=(0,c.useTranslation)(),m=l.hooks.useEnabledNetworkIDs(),w=l.hooks.useEnabledAddressTypes(),S=(0,i.useCallback)((e=>{const t=new Map(a),n=o.Chains.getAddressTypes(e);for(const r of n){const n=a.get(r),o=null==n?void 0:n[e];t.set(r,Object.assign(Object.assign({},n),{[e]:!o}))}const c=w.filter((e=>{const n=t.get(e)||{};return Object.values(n).reduce(((e,t)=>t?++e:e),0)>0}));r(c,t)}),[w,r,a]);(0,d.useEffectOnce)((()=>{const e=new Map;for(const t of w)e.set(t,{});for(const t of m){const n=o.Chains.getAddressTypes(t);for(const r of n){const n=e.get(r);e.set(r,Object.assign(Object.assign({},n),{[t]:!1}))}}r(n,e)}),w.length>0&&m.length>0);const v=(0,i.useMemo)((()=>m.map((t=>{const n=o.Chains.getAddressTypes(t);let r=!1;for(const e of n){const n=a.get(e);r=(null==n?void 0:n[t])||r}return e(i).createElement(C,{key:t,icon:e(i).createElement(p.ChainLogo,{networkID:t,width:40,height:40,stroke:""}),networkID:t,onPressChain:S,isChecked:r})}))),[m,a,S]),b=(0,i.useMemo)((()=>{let e=0;for(const t of a.values())e+=Object.values(t).reduce(((e,t)=>t?++e:e),0);return 0===e}),[a]);return e(i).createElement(h.ConnectHardwareStepContainer,null,e(i).createElement("div",null,e(i).createElement(g.Text,{weight:500,size:28,lineHeight:34},s("connectHardwareSelectChains")),e(i).createElement(x,null,v)),e(i).createElement(u.Button,{onClick:()=>{t(e(i).createElement(f.ConnectHardwareMultichainOpenApp,{preventBack:!0}))},theme:"primary",disabled:b},s("commandContinue")))}})),n.register("cI6uH",(function(e,r){t(e.exports,"useEffectOnce",(function(){return o}));var a=n("29o0l");const o=(e,t)=>{const n=(0,a.useRef)(!1);(0,a.useEffect)((()=>{if(!n.current&&t)return n.current=!0,e()}))}})),n.register("3Kg4v",(function(e,n){t(e.exports,"TOTAL_CONNECT_HARDWARE_STEPS",(function(){return r}));const r=3}))}();
//# sourceMappingURL=ConnectHardwareMultichainFlow.727b05bc.js.map
define=__define;})(window.define);