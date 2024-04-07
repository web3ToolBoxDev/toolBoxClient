(function(define){var __define;"function"==typeof define&&define.amd&&(__define=define,define=null);
function e(e){return e&&e.__esModule?e.default:e}function t(e,t,n,a){Object.defineProperty(e,t,{get:n,set:a,enumerable:!0,configurable:!0})}var n=("undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{}).parcelRequire1d24;n.register("7CSQK",(function(a,r){var o;o=a.exports,Object.defineProperty(o,"__esModule",{value:!0,configurable:!0}),t(a.exports,"default",(function(){return g}));var c=n("7dqns"),i=n("c1thM"),s=n("lDSNw"),l=n("LqQFk"),d=n("1zoRR"),u=n("03gS4"),p=n("6rQTd"),m=n("cOTPM"),h=n("l7cFC");var g=()=>{var t;const{hardwareStepStack:n,pushStep:a,popStep:r,currentStep:o}=(0,m.useHardwareOnboardingStore)(),g=(0,l.default)(n,((e,t)=>(null==e?void 0:e.length)===t.length)),f=(0,s.useCallback)((()=>{var e,t,n,a,c;(null===(e=o())||void 0===e?void 0:e.props.preventBack)||((null===(t=o())||void 0===t?void 0:t.props.onBackCallback)&&(null===(c=null===(n=o())||void 0===n?void 0:(a=n.props).onBackCallback)||void 0===c||c.call(a)),r())}),[o,r]);(0,s.useEffect)((()=>{a(e(s).createElement(p.ConnectHardwareMultichain,null))}),[a]);const y=n.length>(null!=g?g:[]).length,w=0===(null==g?void 0:g.length),v={initial:{x:w?0:y?150:-150,opacity:w?1:0},animate:{x:0,opacity:1},exit:{opacity:0},transition:{duration:.2}};return e(s).createElement(d.ConnectHardwareContainer,null,e(s).createElement(u.StepHeader,{totalSteps:h.TOTAL_CONNECT_HARDWARE_STEPS,onBackClick:f,showBackButton:!(null===(t=o())||void 0===t?void 0:t.props.preventBack),currentStepIndex:n.length-1}),e(s).createElement(c.AnimatePresence,{mode:"wait"},e(s).createElement(i.motion.div,Object.assign({style:{display:"flex",flexGrow:1},key:`${n.length}_${null==g?void 0:g.length}`},v),o())))}})),n.register("1zoRR",(function(e,a){t(e.exports,"ConnectHardwareContainer",(function(){return r}));const r=n("cZIbv").default.main`
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
`})),n.register("03gS4",(function(a,r){t(a.exports,"StepHeader",(function(){return g}));var o=n("4y59b"),c=n("lDSNw"),i=n("cZIbv"),s=n("gR1av"),l=n("miiws"),d=n("aanFI"),u=n("6l2nq");const p=(0,i.default)(u.Row).attrs({justify:"space-between"})`
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
`,g=({onBackClick:t,totalSteps:n,currentStepIndex:a,isHidden:r,showBackButtonOnFirstStep:i,showBackButton:u=!0})=>{const g=u&&(i||0!==a);return e(c).createElement(p,{opacity:r?0:1},g?e(c).createElement(s.ChevronCircle,{right:1,onClick:t},e(c).createElement(d.IconChevronLeft,null)):e(c).createElement(h,null),e(c).createElement(m,null,(0,o.range)(n).map((t=>{const n=t<=a?"#AB9FF2":"#333";return e(c).createElement(l.Circle,{key:t,diameter:12,color:n})}))),e(c).createElement(h,null))}})),n.register("gR1av",(function(e,a){t(e.exports,"ChevronCircle",(function(){return c}));var r=n("cZIbv"),o=n("miiws");const c=(0,r.default)(o.Circle)`
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
`})),n.register("6rQTd",(function(a,r){t(a.exports,"ConnectHardwareMultichain",(function(){return x}));var o=n("belzv"),c=n("lBuGR"),i=n("lMzyG"),s=n("lDSNw"),l=n("NQvFB"),d=n("gMNJN"),u=n("laYjG"),p=n("5ftLv"),m=n("6eOa4"),h=n("kpxNY"),g=n("aanFI"),f=n("02iAW"),y=n("4YoIT"),w=n("7zNi3"),v=n("cOTPM");const S=()=>{(0,c.usePrefetchFeatureFlagsEffect)();const t=(0,v.useHardwareOnboardingStore)((e=>e.pushStep)),n=(0,v.useHardwareOnboardingStore)((e=>e.setSelectedChains)),{t:a}=(0,i.useTranslation)(),r=d.hooks.useEnabledNetworkIDs(),g=d.hooks.useEnabledAddressTypes(),{data:S,isFetching:x,refetch:T}=d.hooks.useRequestLedgerPermission(!0,!0),{buttonDisabled:b,defaultIcon:C,primaryText:E,secondaryText:k,buttonText:I,iconType:A,onClick:H}=(0,s.useMemo)((()=>{var c,i;let d=!1;const u=e(s).createElement(f.SpinnerIcon,null);let m,h,v,b=p.ConfirmationIconType.Default,C=l.NOOP;if(x)m=a("connectHardwareSearching"),h=a("connectHardwareMakeSureConnected"),v=a("commandContinue"),d=!0;else if("granted"===(null==S?void 0:S.type)){const l=null!==(i=null===(c=S.transport.deviceModel)||void 0===c?void 0:c.productName)&&void 0!==i?i:"Ledger";b=p.ConfirmationIconType.Success,m=a("connectHardwarePairSuccessPrimary",{productName:l}),h=a("connectHardwarePairSuccessSecondary",{productName:l}),v=a("commandContinue"),d=!1,C=()=>{if(1===g.length){const a=new Map;a.set(g[0],{});for(const e of r){const t=o.Chains.getAddressTypes(e);for(const n of t)a.set(n,{[e]:!0})}n(g,a),t(e(s).createElement(y.ConnectHardwareMultichainOpenApp,{preventBack:!0}))}else t(e(s).createElement(w.ConnectHardwareMultichainSelectChain,{onBackCallback:()=>{n([],new Map)}}))}}else"denied"===(null==S?void 0:S.type)?(b=p.ConfirmationIconType.Failure,m=a("connectHardwarePermissionDeniedPrimary"),h=a("connectHardwarePermissionDeniedSecondary"),v=a("commandTryAgain"),d=!1,C=T):S&&"unable-to-connect"!==S.type||(b=p.ConfirmationIconType.Failure,m=a("connectHardwarePermissionUnableToConnect"),h=a("connectHardwareWaitingForApplicationSecondaryText"),v=a("commandTryAgain"),d=!1,C=T);return{buttonDisabled:d,defaultIcon:u,primaryText:m,secondaryText:h,buttonText:v,iconType:b,onClick:C}}),[r,g,S,t,T,x,n,a]);return e(s).createElement(m.ConnectHardwareStepContainer,null,e(s).createElement(h.IconHeader,{icon:e(s).createElement(p.ConfirmationIcon,{defaultIcon:C,type:A}),primaryText:E,headerStyle:h.IconHeaderStyle.Large,secondaryText:k}),e(s).createElement(u.Button,{onClick:H,theme:"primary",disabled:b},I))},x=()=>{const{pushSubStep:t}=(0,v.useHardwareOnboardingStore)(),{t:n}=(0,i.useTranslation)();return e(s).createElement(m.ConnectHardwareStepContainer,null,e(s).createElement(h.IconHeader,{icon:e(s).createElement(g.IconLedgerLogo,null),primaryText:n("connectHardwareLedger"),headerStyle:h.IconHeaderStyle.Large,secondaryText:n("connectHardwareStartConnection"),animateText:!0}),e(s).createElement(u.Button,{onClick:()=>{t(e(s).createElement(S,null))},theme:"primary"},n("commandConnect")))}})),n.register("5ftLv",(function(a,r){t(a.exports,"ConfirmationIconType",(function(){return h})),t(a.exports,"ConfirmationIcon",(function(){return f}));var o=n("7dqns"),c=n("c1thM"),i=n("lDSNw"),s=n("cZIbv"),l=n("miiws"),d=n("aanFI");const u=s.default.div`
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
`;var h,g;(g=h||(h={})).Default="default",g.Warning="warning",g.Failure="failure",g.Success="success";const f=({type:t,iconWidth:n,defaultIcon:a,backgroundWidth:r=94})=>e(i).createElement(u,null,e(i).createElement(o.AnimatePresence,{mode:"wait",initial:!1},e(i).createElement(p,{width:r,key:t,initial:{opacity:0},animate:{opacity:1},exit:{opacity:0},transition:{duration:.2}},(()=>{switch(t){case h.Default:return e(i).createElement(l.Circle,{diameter:r,color:"#181818",includeDarkBoxShadow:!0});case h.Warning:return e(i).createElement(l.Circle,{diameter:r,color:"#FFDC62",opacity:.1});case h.Failure:return e(i).createElement(l.Circle,{diameter:r,color:"#EB3742",opacity:.1});case h.Success:return e(i).createElement(l.Circle,{diameter:r,color:"#21E56F",opacity:.1})}})())),e(i).createElement(o.AnimatePresence,{mode:"wait",initial:!0},e(i).createElement(m,{key:t,initial:{opacity:0,y:10},animate:{opacity:1,y:0},exit:{opacity:0,y:10},transition:{duration:.4,bounce:.4,type:"spring"}},(()=>{switch(t){case h.Default:return null!=a?a:e(i).createElement(d.IconQuestionMark,{width:null!=n?n:30});case h.Warning:return e(i).createElement(d.IconExclamationMarkCircle,{width:40,height:40,circleFill:"#FFDC62",exclamationFill:"#00000000"});case h.Failure:return e(i).createElement(d.IconFailure,{width:null!=n?n:30});case h.Success:return e(i).createElement(d.IconCheckmark,{height:"100%",width:null!=n?n:40,fill:"#21E56F"})}})())))})),n.register("6eOa4",(function(e,a){t(e.exports,"ConnectHardwareStepContainer",(function(){return r}));const r=n("cZIbv").default.div`
  padding: 55px 20px 20px;
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
  overflow: auto;
`})),n.register("kpxNY",(function(a,r){t(a.exports,"IconHeaderStyle",(function(){return f})),t(a.exports,"IconHeader",(function(){return x}));var o=n("lDSNw"),c=n("cZIbv"),i=n("e0omL"),s=n("aanFI"),l=n("kn91D");const d=c.default.div`
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
`;var f,y;(y=f||(f={})).Medium="medium",y.Large="large",y.Small="small";const w={[f.Large]:30,[f.Medium]:28,[f.Small]:24},v={[f.Large]:34,[f.Medium]:34,[f.Small]:29},S={[f.Large]:18,[f.Medium]:16,[f.Small]:14},x=({className:t,icon:n,primaryText:a,secondaryText:r,headerStyle:c,showWarning:l=!1,showError:u=!1,animateText:y=!1})=>{c=null!=c?c:f.Medium;const x=w[c],T=v[c],b=S[c],C={[f.Large]:22,[f.Medium]:19,[f.Small]:17}[c],E="small"===c?"16px 0 0 0":void 0,k=u?i.ERROR_COLOR:"#777777";return e(o).createElement(d,{className:t},null!=n?n:e(o).createElement(s.IconUnknownOrigin,null),l?e(o).createElement(g,null,e(o).createElement(s.IconExclamationMarkCircle,null)):e(o).createElement(e(o).Fragment,null),e(o).createElement(p,{animateText:y},a&&e(o).createElement(m,{margin:E,weight:500,size:x,lineHeight:T,maxWidth:"320px"},a),r&&e(o).createElement(h,{margin:E,wordBreak:"break-word",size:b,lineHeight:C,color:k},r)))};x.defaultProps={headerStyle:f.Medium}})),n.register("e0omL",(function(e,n){t(e.exports,"WARNING_COLOR",(function(){return a})),t(e.exports,"DANGER_COLOR",(function(){return r})),t(e.exports,"ERROR_COLOR",(function(){return o}));const a="#FFDC62",r="#EB3742",o="#eb3742"})),n.register("4YoIT",(function(a,r){t(a.exports,"ConnectHardwareMultichainOpenApp",(function(){return O}),(function(e){return O=e}));var o=n("6Tvfa"),c=n("d0go3"),i=n("belzv"),s=n("lBuGR"),l=n("hsoDC"),d=n("lMzyG"),u=n("gd9Oy"),p=n("W0Kfy"),m=n("lDSNw"),h=n("cZIbv"),g=n("8PPME"),f=n("gMNJN"),y=n("d1qx3"),w=n("laYjG"),v=n("03QiC"),S=n("5ftLv"),x=n("6eOa4"),T=n("kpxNY"),b=n("02iAW"),C=n("kn91D"),E=n("hvJaJ"),k=n("cOTPM"),I=function(e,t,n,a){return new(n||(n=Promise))((function(r,o){function c(e){try{s(a.next(e))}catch(e){o(e)}}function i(e){try{s(a.throw(e))}catch(e){o(e)}}function s(e){var t;e.done?r(e.value):(t=e.value,t instanceof n?t:new n((function(e){e(t)}))).then(c,i)}s((a=a.apply(e,t||[])).next())}))};const A=h.default.div`
  align-self: center;
  background-color: rgba(255, 255, 255, 0.03);
  border-radius: 80px;
  padding: 8px 16px;
  max-width: 150px;
`,H=h.default.div`
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
`,O=()=>{const t=(0,k.useHardwareOnboardingStore)((e=>e.chainImportStep)),n=(0,k.useHardwareOnboardingStore)((e=>e.setIncrementChainImportStep)),a=(0,k.useHardwareOnboardingStore)((e=>e.selectedChains)),r=(0,k.useHardwareOnboardingStore)((e=>e.selectedChainsMap)),h=(0,k.useHardwareOnboardingStore)((e=>e.pushStep)),D=(0,k.useHardwareOnboardingStore)((e=>e.pushSubStep)),M=(0,k.useHardwareOnboardingStore)((e=>e.setDiscoveredAccounts)),N=(0,k.useHardwareOnboardingStore)((e=>e.setDerivedAccountGroups)),P=(0,m.useRef)(k.useHardwareOnboardingStore.getState().derivedAccountGroups),{t:B,i18n:L}=(0,d.useTranslation)(),F=a[t-1],{data:j=[],isFetched:R,isError:$}=f.hooks.useAllMultiChainAccounts(),[z,G]=(0,m.useState)(!1),_=(0,m.useMemo)((()=>{const e=[],t=r.get(F)||{};for(const[n,a]of Object.entries(t))a&&e.push(n);return e}),[F,r]),{chainNameTextOr:W,chainNameTextAnd:Y}=(0,m.useMemo)((()=>{const e=_.map((e=>i.Chains.getChainName(e))),t=new Intl.ListFormat(L.resolvedLanguage,{style:"long",type:"disjunction"}),n=new Intl.ListFormat(L.resolvedLanguage,{style:"long",type:"conjunction"});return{chainNameTextOr:t.format(e),chainNameTextAnd:n.format(e)}}),[_,L]),K=(0,m.useMemo)((()=>_.map((t=>e(m).createElement(v.ChainLogo,{key:t,networkID:t,width:90,height:90,strokeWidth:1})))),[_]);(0,m.useEffect)((()=>{const e=k.useHardwareOnboardingStore.subscribe((e=>P.current=e.derivedAccountGroups));return()=>e()}),[]);const Z=(0,m.useMemo)((()=>{const e=[];switch(F){case u.AddressType.Solana:e.push({pathType:c.DerivationPathType.Bip44RootSolana});break;case u.AddressType.EVM:e.push({pathType:c.DerivationPathType.Bip44RootEthereum});case u.AddressType.BitcoinTaproot:case u.AddressType.BitcoinNativeSegwit:case u.AddressType.BitcoinNestedSegwit:case u.AddressType.BitcoinLegacy:}for(let t=0;t<19;++t)switch(F){case u.AddressType.Solana:e.push({index:t,pathType:c.DerivationPathType.Bip44ChangeSolana}),e.push({index:t,pathType:c.DerivationPathType.Bip44Solana});break;case u.AddressType.EVM:e.push({index:t,pathType:c.DerivationPathType.Bip44Ethereum}),e.push({index:t,pathType:c.DerivationPathType.Bip44EthereumSecondary});break;case u.AddressType.BitcoinTaproot:case u.AddressType.BitcoinNativeSegwit:case u.AddressType.BitcoinNestedSegwit:case u.AddressType.BitcoinLegacy:e.push({index:t,pathType:c.DerivationPathType.BitcoinTaproot},{index:t,pathType:c.DerivationPathType.BitcoinNativeSegwit})}return e}),[F]),[Q,q]=(0,m.useState)(!0),{data:J=l.LEDGER_NOT_CONNECTED_STATE}=f.hooks.useLedgerWireTransportState(Q,!0),{data:[V]}=(0,s.useFeatureFlags)(["kill-ledger-xpub-derivation"]),{data:U,error:X,fetchStatus:ee,refetch:te}=f.hooks.useLedgerAddresses(J,Z,!0,!V),ne="fetching"===ee,ae=!J.isConnected&&"reconnecting"!==J.status,[re,oe]=(0,m.useState)(!1),{data:ce,refetch:ie}=f.hooks.useRequestLedgerPermission(re,!0);(0,m.useEffect)((()=>{ae&&q(!1)}),[ae]),(0,m.useEffect)((()=>{"granted"===(null==ce?void 0:ce.type)&&(q(!0),oe(!1))}),[ce]);const se=(0,m.useCallback)((()=>I(void 0,void 0,void 0,(function*(){var n;if(U&&Object.keys(U).length){const r=[...P.current];let c=0;for(const e of Object.values(U)){const t=null!==(n=r[c])&&void 0!==n?n:{accounts:{}},a={accounts:Object.assign({},t.accounts),derivationIndex:Z[c].index};switch(e.addressType){case u.AddressType.EVM:_.includes(i.NetworkIDs.Polygon.Mainnet)&&(a.accounts[`${i.NetworkIDs.Polygon.Mainnet}-${e.address}`]={chainType:e.addressType,chainId:i.NetworkIDs.Polygon.Mainnet,address:e.address,publicKey:e.publicKey,pathParams:Z[c]}),_.includes(i.NetworkIDs.Ethereum.Mainnet)&&(a.accounts[`${i.NetworkIDs.Ethereum.Mainnet}-${e.address}`]={chainType:e.addressType,chainId:i.NetworkIDs.Ethereum.Mainnet,address:e.address,publicKey:e.publicKey,pathParams:Z[c]});break;case u.AddressType.Solana:a.accounts[`${i.NetworkIDs.Solana.Mainnet}-${e.address}`]={chainType:e.addressType,address:e.address,publicKey:e.publicKey,chainId:i.NetworkIDs.Solana.Mainnet,pathParams:Z[c]};break;case u.AddressType.BitcoinTaproot:case u.AddressType.BitcoinNativeSegwit:case u.AddressType.BitcoinNestedSegwit:case u.AddressType.BitcoinLegacy:a.accounts[`${i.NetworkIDs.Bitcoin.Mainnet}-${e.address}`]={chainType:e.addressType,address:e.address,publicKey:e.publicKey,chainId:i.NetworkIDs.Bitcoin.Mainnet,pathParams:Z[c]}}r[c]=a,c++}if(N(r),R&&a.length===t){G(!0);const t=(e=>{const t=new Set;for(const n of e)for(const{address:e}of n.addresses)t.add(e);return t})(j),n=r.reduce(((e,n)=>{let a=!1;for(const{address:e}of Object.values(n.accounts))a=a||t.has(e);return a||e.push(n),e}),[]),a=[],c=[];for(let e=0;e<n.length;e+=p.BATCH_SIZE_BY_PLATFORM.extension){const t=n.slice(e,e+p.BATCH_SIZE_BY_PLATFORM.extension).map((e=>Object.entries(e.accounts).reduce(((e,[t,n])=>(e[t]={account:n},e)),{})));c.push(t)}for(const e of c)a.push((0,p.discoverAccounts)(e));const i=(yield Promise.all(a)).flat().map((e=>{switch(e.status){case"discovered":return Object.assign(Object.assign({},e),{accounts:e.accounts.filter((e=>e.hasAccountActivity||(0,o.isRecommendedDerivationPathType)(e.derivationPathType)))});case"undiscovered":return Object.assign(Object.assign({},e),{accounts:e.accounts.filter((e=>(0,o.isRecommendedDerivationPathType)(e.derivationPathType)))})}})).filter((e=>e.accounts.length>0)).map((e=>{const t=(0,g.default)();return Object.assign(Object.assign({},e),{discoveryIdentifier:t})})),s=i.filter((e=>"undiscovered"===e.status||e.isSelectedByDefault)),l=i.filter((e=>!("undiscovered"===e.status||e.isSelectedByDefault))).slice(0,2),d=s.length>0,u=j.filter((e=>e.type===o.AccountType.Ledger)).length,f=(d?[...s,...l]:i.filter((e=>!e.accounts.some((e=>!(0,o.isRecommendedDerivationPathType)(e.derivationPathType))))).slice(0,3)).map(((e,t)=>Object.assign(Object.assign({},e),{accountIndex:u+t})));M(f,d),h(e(m).createElement(E.ConnectHardwareMultichainImportAccount,{preventBack:!0}))}}}))),[U,N,R,a.length,t,Z,_,j,M,h]);let le,de,ue,pe;(0,m.useEffect)((()=>{U&&Object.keys(U).length===Z.length&&(se(),a.length!==t&&(n(),D(e(m).createElement(O,{preventBack:!0}))))}),[U,Z,h,D,t,a,se,n]);let me=()=>{};return $?(le=e(m).createElement(S.ConfirmationIcon,{type:S.ConfirmationIconType.Failure}),de=B("connectHardwareErrorLedgerGeneric"),ue=B("connectHardwareErrorLedgerPhantomLocked"),me=()=>I(void 0,void 0,void 0,(function*(){const e=yield(0,y.getCurrentTabAsync)();void 0!==e.id&&(0,y.closeTabAsync)(e.id)})),pe=B("commandClose")):ce&&"granted"!==ce.type?(le=e(m).createElement(S.ConfirmationIcon,{type:S.ConfirmationIconType.Warning}),de=B("connectHardwarePermissionDeniedPrimary"),ue=B("connectHardwarePermissionDeniedSecondary"),pe=B("homeErrorButtonText"),me=ie):ae?(le=e(m).createElement(S.ConfirmationIcon,{type:S.ConfirmationIconType.Warning}),de=B("connectHardwarePermissionUnableToConnect"),ue=B("connectHardwarePermissionUnableToConnectDescription"),pe=B("commandConnect"),me=ie):X instanceof l.LedgerLockedError?(le=e(m).createElement(S.ConfirmationIcon,{type:S.ConfirmationIconType.Failure}),de=B("connectHardwareErrorLedgerLocked"),ue=B("connectHardwareErrorLedgerLockedDescription"),pe=B("homeErrorButtonText"),me=te):X?(le=e(m).createElement(S.ConfirmationIcon,{type:S.ConfirmationIconType.Failure}),de=B("connectHardwareErrorLedgerGeneric"),ue=B("connectHardwareErrorLedgerGenericDescription"),pe=B("homeErrorButtonText"),me=te):"reconnecting"==J.status?(le=e(m).createElement(S.ConfirmationIcon,{defaultIcon:e(m).createElement(b.SpinnerIcon,null),type:S.ConfirmationIconType.Default}),de=B("connectHardwareConnecting"),ue=B("connectHardwareConnectingDescription")):z?(le=e(m).createElement(S.ConfirmationIcon,{defaultIcon:e(m).createElement(b.SpinnerIcon,null),type:S.ConfirmationIconType.Default}),de=B("connectHardwareDiscoveringAccounts"),ue=B("connectHardwareDiscoveringAccountsDescription")):ne?(le=e(m).createElement(S.ConfirmationIcon,{defaultIcon:e(m).createElement(b.SpinnerIcon,null),type:S.ConfirmationIconType.Default}),de=B("connectHardwareConnectingAccounts"),ue=B("connectHardwareFindingAccountsWithActivity",{chainName:Y})):(le=e(m).createElement(H,{logoCount:K.length},K),de=B("connectHardwareOpenAppInterpolated",{app:W}),ue=B("connectHardwareOpenAppDescription")),e(m).createElement(x.ConnectHardwareStepContainer,null,e(m).createElement(T.IconHeader,{icon:le,primaryText:de,headerStyle:T.IconHeaderStyle.Large,secondaryText:ue}),pe?e(m).createElement(w.Button,{onClick:me,theme:"primary"},pe):e(m).createElement(A,null,e(m).createElement(C.Text,{color:"#999999",size:14},B("connectHardwareAccountsStepOfSteps",{stepNum:t,totalSteps:a.length}))))}})),n.register("hvJaJ",(function(a,r){t(a.exports,"ConnectHardwareMultichainImportAccount",(function(){return y}));var o=n("lMzyG"),c=n("lDSNw"),i=n("cZIbv"),s=n("laYjG"),l=n("5ftLv"),d=n("6eOa4"),u=n("kpxNY"),p=n("7R0Mp"),m=n("ajvrz"),h=n("cOTPM");const g=i.default.div`
  margin-bottom: 35px;
`,f=(0,i.default)(s.Button)`
  margin-bottom: 10px;
`,y=()=>{const t=(0,h.useHardwareOnboardingStore)((e=>e.discoveredAccounts)),n=(0,h.useHardwareOnboardingStore)((e=>e.activeAccountsFound)),a=(0,h.useHardwareOnboardingStore)((e=>e.setSelectedAccounts)),r=(0,h.useHardwareOnboardingStore)((e=>e.pushSubStep)),{t:i}=(0,o.useTranslation)(),y=(0,c.useMemo)((()=>{let e;if(n){const n=t.filter((e=>"undiscovered"===e.status||e.isSelectedByDefault));e=i(1===n.length?"connectHardwareFoundAccountsWithActivitySingular":"connectHardwareFoundAccountsWithActivity",{numOfAccounts:n.length})}else e=i("connectHardwareFoundSomeAccounts");return e}),[n,i,t]),w=(0,c.useCallback)((()=>{r(e(c).createElement(m.ConnectHardwareMultichainSelectAccounts,{activeAccounts:t}))}),[r,t]),v=(0,c.useCallback)((()=>{r(e(c).createElement(p.ConnectHardwareMultichainImportConfirmation,{preventBack:!0}))}),[r]);return(0,c.useEffect)((()=>{const e=t.reduce(((e,t,n)=>(("discovered"===t.status&&t.isSelectedByDefault||0===n)&&(e[t.discoveryIdentifier]=!0),e)),{});a(e)}),[t,a,n,i]),e(c).createElement(d.ConnectHardwareStepContainer,null,e(c).createElement(g,null,e(c).createElement(u.IconHeader,{icon:e(c).createElement(l.ConfirmationIcon,{type:l.ConfirmationIconType.Success}),primaryText:i("connectHardwareConnectAccounts"),headerStyle:u.IconHeaderStyle.Large,secondaryText:y})),e(c).createElement(f,{onClick:w,theme:"default"},i("connectHardwareSelectAccounts")),e(c).createElement(s.Button,{onClick:v,theme:"primary"},i("commandContinue")))}})),n.register("7R0Mp",(function(a,r){t(a.exports,"ConnectHardwareMultichainImportConfirmation",(function(){return h}));var o=n("d0go3"),c=n("lMzyG"),i=n("lDSNw"),s=n("gMNJN"),l=n("laYjG"),d=n("5ftLv"),u=n("6eOa4"),p=n("kpxNY"),m=n("cOTPM");const h=()=>{const t=(0,m.useHardwareOnboardingStore)((e=>e.discoveredAccounts)),n=(0,m.useHardwareOnboardingStore)((e=>e.selectedAccounts)),{t:a}=(0,c.useTranslation)(),{mutateAsync:r}=s.hooks.useConnectLedgerAccounts(),{mutateAsync:h}=s.hooks.useUpdateVisibleBitcoinAddressTypes(),[g,f]=(0,i.useState)(!1),y=(0,i.useMemo)((()=>t.filter((e=>!!n[e.discoveryIdentifier]))),[t,n]);return(0,i.useEffect)((()=>{if(y.length){const e=[],t=new Set;for(const n of y){const{accounts:a,seedIndex:r,accountIndex:c}=n,i=[],s=[];for(const e of a)(0,o.isBitcoinDerivationPathType)(e.derivationPathType)?(s.push({pathType:e.derivationPathType,value:e.publicKey}),"amount"in e&&0===parseFloat(e.amount)||t.add(e.chainType)):((0,o.isEVMDerivationPathType)(e.derivationPathType)||(0,o.isSolanaDerivationPathType)(e.derivationPathType))&&i.push({pathType:e.derivationPathType,value:e.address});e.push({derivationIndex:r,addresses:i,publicKeys:s,accountIndex:c})}r({accounts:e}).then((()=>{t.size>0&&h({addressTypes:Array.from(t)})})).finally((()=>f(!0)))}else f(!0)}),[y,r,h]),e(i).createElement(u.ConnectHardwareStepContainer,null,e(i).createElement(p.IconHeader,{icon:e(i).createElement(d.ConfirmationIcon,{type:d.ConfirmationIconType.Success}),primaryText:a("connectHardwareAccountsAddedInterpolated",{numOfAccounts:y.length}),headerStyle:p.IconHeaderStyle.Large,secondaryText:a("connectHardwareFinishSecondaryText")}),e(i).createElement(l.Button,{onClick:()=>{window.close()},theme:"primary",disabled:!g},a("pastParticipleDone")))}})),n.register("cOTPM",(function(a,r){t(a.exports,"useHardwareOnboardingStore",(function(){return l}));var o=n("4y59b"),c=n("90BMT"),i=n("9xrNA");const s={hardwareStepStack:[],hardwareStepSubStack:{},selectedChains:[],selectedChainsMap:new Map,chainImportStep:1,derivedAccountGroups:[],discoveredAccounts:[],activeAccountsFound:!1,selectedAccounts:{}},l=e(i)(((e,t)=>Object.assign(Object.assign({},s),{pushStep:n=>{const a=t().hardwareStepStack;e({hardwareStepStack:a.concat(n)})},popStep:()=>{var n;const a=t().hardwareStepStack.length-1;if((null!==(n=t().hardwareStepSubStack[a])&&void 0!==n?n:[]).length)return e((0,c.default)((e=>{e.hardwareStepSubStack[a]=e.hardwareStepSubStack[a].slice(0,-1)})));e((0,c.default)((e=>{e.hardwareStepStack=e.hardwareStepStack.slice(0,-1)})))},pushSubStep:n=>{var a;const r=t().hardwareStepStack.length-1,o=null!==(a=t().hardwareStepSubStack[r])&&void 0!==a?a:[];e((0,c.default)((e=>{e.hardwareStepSubStack[r]=o.concat([n])})))},currentStep:()=>{var e;const n=t().hardwareStepStack,a=t().hardwareStepSubStack,r=n.length>0?n.length-1:n.length;return(null===(e=a[r])||void 0===e?void 0:e.length)?(0,o.getLast)(a[r]):(0,o.getLast)(n)},setSelectedChains:(t,n)=>{e({selectedChains:t,selectedChainsMap:n})},setDecrementChainImportStep:()=>{const n=t().chainImportStep;e({chainImportStep:n-1})},setIncrementChainImportStep:()=>{const n=t().chainImportStep;e({chainImportStep:n+1})},setDerivedAccountGroups:t=>{e({derivedAccountGroups:t})},setDiscoveredAccounts:(t,n)=>{e({discoveredAccounts:t,activeAccountsFound:n})},selectAccount:n=>{const a=t().selectedAccounts,r=Object.assign({},a);r[n]=!0,e({selectedAccounts:r})},deselectAccount:n=>{const a=t().selectedAccounts,r=Object.assign({},a);delete r[n],e({selectedAccounts:r})},setSelectedAccounts:t=>{e({selectedAccounts:t})}})))})),n.register("ajvrz",(function(a,r){t(a.exports,"ConnectHardwareMultichainSelectAccounts",(function(){return g}));var o=n("lMzyG"),c=n("lDSNw"),i=n("cZIbv"),s=n("izP3E"),l=n("laYjG"),d=n("6eOa4"),u=n("kn91D"),p=n("7R0Mp"),m=n("cOTPM");const h=(0,i.default)(u.Text)`
  margin-top: 15px;
`,g=({activeAccounts:t})=>{const n=(0,m.useHardwareOnboardingStore)((e=>e.selectedAccounts)),a=(0,m.useHardwareOnboardingStore)((e=>e.selectAccount)),r=(0,m.useHardwareOnboardingStore)((e=>e.deselectAccount)),i=(0,m.useHardwareOnboardingStore)((e=>e.pushSubStep)),{t:g}=(0,o.useTranslation)(),f=(0,c.useMemo)((()=>0===Object.values(n).filter((e=>!!e)).length),[n]),y=(0,c.useCallback)((()=>{i(e(c).createElement(p.ConnectHardwareMultichainImportConfirmation,{preventBack:!0}))}),[i]);return e(c).createElement(d.ConnectHardwareStepContainer,null,e(c).createElement("div",{style:{marginBottom:15}},e(c).createElement("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:30}},e(c).createElement(u.Text,{weight:500,size:30,lineHeight:34,maxWidth:"320px"},g("connectHardwareSelectAccounts")),e(c).createElement(h,{wordBreak:"break-word",size:18,lineHeight:22,color:"#777777"},g("connectHardwareChooseAccountsToConnect"))),e(c).createElement("div",{style:{maxHeight:420,overflowY:"scroll"}},t.map((({accounts:t,discoveryIdentifier:o,accountIndex:i})=>{const l=!!n[o];return e(c).createElement(s.DiscoveredAccountRow,{key:o,accountType:"ledger",accounts:t,accountIndex:i,checked:l,onPress:()=>{l?r(o):a(o)}})})))),e(c).createElement(l.Button,{onClick:y,theme:"primary",disabled:f},g("commandContinue")))}})),n.register("izP3E",(function(a,r){t(a.exports,"DiscoveredAccountRow",(function(){return f}));var o=n("6Tvfa"),c=n("lMzyG"),i=n("4y59b"),s=n("lDSNw"),l=n("gmVmN"),d=n("cZIbv"),u=n("03QiC"),p=n("7E6dj"),m=n("e4sKe"),h=n("kn91D");const g=({account:t})=>{const{t:n}=(0,c.useTranslation)();return e(s).createElement(b,null,e(s).createElement(w,null,e(s).createElement(u.ChainLogo,{networkID:t.chain.id,height:40,width:40,spacing:"large"})),e(s).createElement(v,null,e(s).createElement(x,null,e(s).createElement(m.TokenNameBadge,{networkID:t.chain.id,walletAddress:t.address},e(s).createElement(C,null,t.chain.name)),e(s).createElement(C,null,(0,o.formatHashMedium)(t.address,4))),e(s).createElement(S,null,"amount"in t&&"chain"in t?e(s).createElement(E,null,(0,l.formatTokenAmount)(t.amount)," ",t.chain.symbol):null,"amount"in t?e(s).createElement(E,null,t.lastActivityTimestamp?n("onboardingImportAccountsLastActive",{formattedTimestamp:(0,i.formatTimestampFromNow)(1e3*t.lastActivityTimestamp,!0)}):n("onboardingImportAccountsCreateNew")):null)))},f=e(s).memo((({accountType:t,accounts:n,checked:a,accountIndex:r,onPress:o})=>{const{t:i}=(0,c.useTranslation)(),l=r+1;return e(s).createElement(y,null,e(s).createElement(T,null,e(s).createElement(C,null,((e,t,n)=>{switch(t){case"seed":return e("onboardingImportAccountsAccountName",{walletIndex:n});case"ledger":return e("onboardingImportAccountsLedgerAccountName",{walletIndex:n})}})(i,t,l)),e(s).createElement(p.Checkbox,{checked:a,onChange:o})),n.map(((t,n)=>e(s).createElement(g,{key:`${t.address}-${n}`,account:t}))))})),y=d.default.div`
  margin-bottom: 24px;
  width: 100%;
`,w=d.default.div`
  flex-shrink: 0;
  margin-right: 10px;
`,v=d.default.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`,S=d.default.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`,x=(0,d.default)(S)`
  margin-bottom: 2px;
`,T=(0,d.default)(S)`
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
`,C=(0,d.default)(h.Text).attrs({size:16,lineHeight:19,weight:600})``,E=(0,d.default)(h.Text).attrs({size:14,lineHeight:17,weight:400,color:"#777777"})``})),n.register("7zNi3",(function(a,r){t(a.exports,"ConnectHardwareMultichainSelectChain",(function(){return b}));var o=n("belzv"),c=n("lMzyG"),i=n("lDSNw"),s=n("cZIbv"),l=n("gMNJN"),d=n("gdILj"),u=n("laYjG"),p=n("03QiC"),m=n("7E6dj"),h=n("6eOa4"),g=n("kn91D"),f=n("4YoIT"),y=n("cOTPM");const w=s.default.div`
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
`,v=s.default.div`
  margin-right: 12px;
`,S=s.default.div`
  margin-top: 30px;
`,x=s.default.div`
  display: flex;
  align-items: center;
`,T=({networkID:t,icon:n,onPressChain:a,isChecked:r})=>e(i).createElement(w,{onClick:()=>{a(t)}},e(i).createElement(x,null,e(i).createElement(v,null,n),e(i).createElement(g.Text,{size:16,weight:600},o.Chains.getNetworkName(t))),e(i).createElement(m.Checkbox,{checked:r})),b=()=>{const{pushSubStep:t,selectedChains:n,setSelectedChains:a,selectedChainsMap:r}=(0,y.useHardwareOnboardingStore)(),{t:s}=(0,c.useTranslation)(),m=l.hooks.useEnabledNetworkIDs(),w=l.hooks.useEnabledAddressTypes(),v=(0,i.useCallback)((e=>{const t=new Map(r),n=o.Chains.getAddressTypes(e);for(const a of n){const n=r.get(a),o=null==n?void 0:n[e];t.set(a,Object.assign(Object.assign({},n),{[e]:!o}))}const c=w.filter((e=>{const n=t.get(e)||{};return Object.values(n).reduce(((e,t)=>t?++e:e),0)>0}));a(c,t)}),[w,a,r]);(0,d.useEffectOnce)((()=>{const e=new Map;for(const t of w)e.set(t,{});for(const t of m){const n=o.Chains.getAddressTypes(t);for(const a of n){const n=e.get(a);e.set(a,Object.assign(Object.assign({},n),{[t]:!1}))}}a(n,e)}),w.length>0&&m.length>0);const x=(0,i.useMemo)((()=>m.map((t=>{const n=o.Chains.getAddressTypes(t);let a=!1;for(const e of n){const n=r.get(e);a=(null==n?void 0:n[t])||a}return e(i).createElement(T,{key:t,icon:e(i).createElement(p.ChainLogo,{networkID:t,width:40,height:40,stroke:""}),networkID:t,onPressChain:v,isChecked:a})}))),[m,r,v]),b=(0,i.useMemo)((()=>{let e=0;for(const t of r.values())e+=Object.values(t).reduce(((e,t)=>t?++e:e),0);return 0===e}),[r]);return e(i).createElement(h.ConnectHardwareStepContainer,null,e(i).createElement("div",null,e(i).createElement(g.Text,{weight:500,size:28,lineHeight:34},s("connectHardwareSelectChains")),e(i).createElement(S,null,x)),e(i).createElement(u.Button,{onClick:()=>{t(e(i).createElement(f.ConnectHardwareMultichainOpenApp,{preventBack:!0}))},theme:"primary",disabled:b},s("commandContinue")))}})),n.register("gdILj",(function(e,a){t(e.exports,"useEffectOnce",(function(){return o}));var r=n("lDSNw");const o=(e,t)=>{const n=(0,r.useRef)(!1);(0,r.useEffect)((()=>{if(!n.current&&t)return n.current=!0,e()}))}})),n.register("l7cFC",(function(e,n){t(e.exports,"TOTAL_CONNECT_HARDWARE_STEPS",(function(){return a}));const a=3}));
//# sourceMappingURL=ConnectHardwareMultichainFlow.f0a3e674.js.map
define=__define;})(window.define);