(function(define){var __define;"function"==typeof define&&define.amd&&(__define=define,define=null);
function e(e){return e&&e.__esModule?e.default:e}function t(e,t,n,a){Object.defineProperty(e,t,{get:n,set:a,enumerable:!0,configurable:!0})}var n=("undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{}).parcelRequire1d24;n.register("bNkV0",(function(a,i){var l;l=a.exports,Object.defineProperty(l,"__esModule",{value:!0,configurable:!0}),t(a.exports,"default",(function(){return R}),(function(e){return R=e}));var r=n("6Tvfa"),o=n("belzv"),s=n("lBuGR"),c=n("gYh0e"),u=n("lMzyG"),d=n("4y59b"),g=n("fvKRK"),m=n("lDSNw"),p=n("5jGDu"),h=n("cZIbv"),b=n("cyeOH"),f=n("44I6u"),x=n("hjWkM"),y=n("13Voq"),k=n("lFbWC"),v=n("bKtYH"),E=n("6ha3o"),w=n("aXzxc"),S=n("hnhp8"),A=n("e9bgh"),T=n("iKm61"),M=n("iTDlK"),C=n("gMNJN"),D=n("2LZGp"),B=n("1j4wJ"),F=n("h5kyv"),I=n("8egSn"),N=function(e,t,n,a){return new(n||(n=Promise))((function(i,l){function r(e){try{s(a.next(e))}catch(e){l(e)}}function o(e){try{s(a.throw(e))}catch(e){l(e)}}function s(e){var t;e.done?i(e.value):(t=e.value,t instanceof n?t:new n((function(e){e(t)}))).then(r,o)}s((a=a.apply(e,t||[])).next())}))};const L=e(m).memo((({visibilityOverrides:t,fungibles:n,isMainnet:a,onMouseEnter:i})=>{var l;const{t:r}=(0,u.useTranslation)(),{pushDetailView:s}=(0,E.useDetailViews)(),c=(0,m.useRef)(document.getElementById("tab-content"));(0,m.useEffect)((()=>{const e=document.getElementById("tab-content");e&&(c.current=e)}),[]);const d=(0,m.useCallback)((({networkID:t,chainName:n,fungibleKey:a,name:i,symbol:l,tokenAddress:r,type:c,walletAddress:u})=>{F.analytics.capture("assetDetailClick",{asset:{type:"fungible",chain:n,isNativeOfType:n,address:r},data:{networkId:t,chainId:o.Chains.getChainID(t)}}),s(e(m).createElement(I.FungibleDetailPage,{networkID:t,chainName:n,name:i,symbol:l,fungibleKey:a,tokenAddress:r,type:c,walletAddress:u}))}),[s]),g=(0,m.useCallback)((({key:l,index:o,style:s})=>{const c=Math.min(o+1,n.length),u=[];for(let l=o;l<c;l++){const s=n[l],c=s.type,{chain:g,name:p,symbol:h,key:b,tokenAddress:f,walletAddress:x}=s.data,y=null!=p?p:r("assetDetailUnknownToken");u.push(e(m).createElement(S.FungibleTokenRow,Object.assign({},(0,S.fungibleToProps)(s,t),{key:`${b}-${o}`,onClick:()=>d({networkID:g.id,chainName:g.name,fungibleKey:b,name:y,symbol:h,tokenAddress:f,type:c,walletAddress:x}),onMouseEnter:i,showBalance:!0,showCurrencyValues:a})))}return e(m).createElement("div",{key:l,style:s},u)}),[n,a,d,i,r,t]);return e(m).createElement(p.WindowScroller,{scrollElement:null!==(l=c.current)&&void 0!==l?l:void 0},(({height:t=0,isScrolling:a,registerChild:i,scrollTop:l})=>e(m).createElement(p.AutoSizer,{disableHeight:!0,style:{width:"100%"}},(({width:r})=>e(m).createElement("div",{ref:i},e(m).createElement(p.List,{autoHeight:!0,width:r,height:t,scrollTop:l,isScrolling:a,rowCount:n.length,rowHeight:S.FUNGIBLE_TOKEN_ROW_HEIGHT+10,rowRenderer:g}))))))})),P=(0,d.toMilliseconds)({seconds:5}),z=(0,d.toMilliseconds)({seconds:10}),H=h.default.div`
  margin-top: 32px;
  margin-bottom: 32px;
  width: 100%;
`;var R=()=>{const{data:t,isHidingAllFungibles:n,isLoading:a,isErrorTokens:i,isReadOnlyAccount:l,refetch:o,shouldShowPartialError:d,partialErrorMessage:p}=(()=>{const e=(0,g.useQueryClient)(),{showDepositListModal:t,showFungibleVisibilityModal:n,showBuyFungibleSelectionModal:a,showSendFungibleSelectionModal:i}=(0,w.useLegacyModals)(),{handleShowModalVisibility:l,handleHideModalVisibility:o}=(0,D.useModals)(),{t:d}=(0,u.useTranslation)(),p=(0,m.useMemo)((()=>({manageTokenList:d("homeManageTokenList"),receive:d("commandReceive"),send:d("commandSend"),buy:d("commandBuy"),errorTitle:d("homeErrorTitle"),errorDescription:d("homeErrorDescription"),errorButton:d("homeErrorButtonText")})),[d]),{data:[h]}=(0,s.useFeatureFlags)(["enable-cta-bar"]),{data:b}=C.hooks.useSelectedMultiChainAccount(),{ctaActions:f,shouldShowPartialError:x,partialErrorMessage:y}=C.hooks.useHomeViewState({onTappingBuy:a,onTappingReceive:t,onTappingSend:i,account:b}),{accountBalance:k,accountId:v}=(0,m.useMemo)((()=>{var e,t;return{accountBalance:null===(e=null==b?void 0:b.balance)||void 0===e?void 0:e.value,accountId:null!==(t=null==b?void 0:b.identifier)&&void 0!==t?t:""}}),[b]),E=null==b?void 0:b.isReadOnly,S=!C.hooks.useIsTestnetMode(),T=(0,c.useFungiblesStore)((e=>e.resetSendSlice));(0,m.useEffect)((function(){v&&T()}),[v,T]);const{fungibles:M,visibilityOverrides:F,portfolio:I,isHidingAllFungibles:L,isLoadingVisibilityOverrides:H,isLoadingTokens:R,isLoadingPrices:V,isErrorTokens:O,refetch:W}=C.hooks.useFungibles({useTokenQueryOptions:{staleTime:P,refetchInterval:z}}),{mutate:$}=C.hooks.useSetMultiChainAccountBalance();(0,r.useSetAccountBalanceEffect)({accountBalance:k,accountId:v,value:I.value,setAccountBalance:$});const j=C.hooks.useSelectedNetworks();(0,B.useWalletBalanceAnalytics)(M,j,v);const U=(0,m.useCallback)((()=>N(void 0,void 0,void 0,(function*(){return yield(0,c.prefetchSPLTokenMap)(e)}))),[e]),G=(0,m.useMemo)((()=>M.filter((e=>(0,c.isVisibleMint)(F,{key:e.data.key,spamStatus:e.data.spamStatus})))),[M,F]),Z=H||R||V,{buttonDisabled:K}=(0,A.getButtonState)({isLoading:Z,isEnabled:M.length>0||L,isErrorTokens:O});return{data:(0,m.useMemo)((()=>({fungibles:G,earnings:I.earnings,value:I.value,isMainnet:S,translations:p,visibilityOverrides:F,enableCTABar:h,ctaActions:f,buttonDisabled:K,showDepositListModal:t,showBuyFungibleSelectionModal:a,showSendFungibleSelectionModal:i,showFungibleVisibilityModal:n,handlePrefetchSPLTokenMap:U,handleShowModalVisibility:l,handleHideModalVisibility:o})),[F,G,I,n,p,S,a,t,i,U,l,o,h,f,K]),isHidingAllFungibles:L,isLoading:H||R||V,isErrorTokens:O,isReadOnlyAccount:E,refetch:W,shouldShowPartialError:x,partialErrorMessage:y}})(),{fungibles:h,translations:E,isMainnet:S,earnings:F,value:I,visibilityOverrides:R,enableCTABar:V,ctaActions:O,buttonDisabled:W,showDepositListModal:$,showBuyFungibleSelectionModal:j,showSendFungibleSelectionModal:U,handlePrefetchSPLTokenMap:G,handleShowModalVisibility:Z}=t,{manageTokenList:K,receive:_,send:Q,buy:J,errorTitle:X,errorDescription:Y,errorButton:q}=E,ee=h.length>0;return e(m).createElement(f.Column,{align:"center"},e(m).createElement(A.Header,{enableCTABar:V,earnings:F,value:I,buyButtonText:J,receiveButtonText:_,hasFungibles:ee,isErrorTokens:i,isLoading:a,isHidingAllFungibles:n,isReadOnlyAccount:l,sendButtonText:Q,showDollarValues:S,prefetchSPLTokenMap:G,showSendFungibleSelectionModal:U,showDepositListModal:$,showBuyFungibleSelectionModal:j,shouldShowPartialError:d,partialErrorMessage:p}),V&&!l&&e(m).createElement(H,null,e(m).createElement(x.CTABar,{disabled:W,actions:O,uiContextName:"home"})),e(m).createElement(b.ActionBannersVisibility,{isReadOnlyAccount:l}),e(m).createElement(k.HelloBitcoinInterstitialVisibility,null),e(m).createElement(y.ForceUpgradeInterstitialVisibility,null),a?[1,2,3].map((t=>e(m).createElement(v.RowSkeletonLoader,{key:`fungible-token-row-loader-${t}`}))):ee?e(m).createElement(L,{visibilityOverrides:R,fungibles:h,isMainnet:S,onMouseEnter:G}):n?null:e(m).createElement(T.HomeError,{title:X,description:Y,buttonText:q,refetch:o}),a?null:ee||n?e(m).createElement(M.ManageTokenListButton,{buttonText:K,onClick:()=>Z("fungibleVisibility")}):null)}})),n.register("cyeOH",(function(a,i){t(a.exports,"ActionBannersVisibility",(function(){return S}));var l=n("lBuGR"),r=n("8NH57"),o=n("lDSNw"),s=n("lQxWu"),c=n("cZIbv"),u=n("gMNJN"),d=n("c3wGO"),g=n("d1qx3"),m=n("aanFI"),p=n("3ou76"),h=n("57LGC"),b=n("eayxI");const f=c.default.div`
  height: 0;
  transition: height 0.2s ease-in-out;
  width: 100%;
  ${e=>e.animate?"height: "+(e.shouldCollapse?"100px":"120px"):""}
`,x=c.default.div`
  transition: transform 0.5s ease;
  width: 100%;
`,y=(0,c.default)(p.IconBackground)``,k=c.default.div`
  visibility: ${e=>e.isVisible?"visible":"hidden"};
`,v=c.default.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
`,E=e(o).memo((({banners:t,currentIndex:n,hasNextBanner:a,hasPrevBanner:i,onNextBannerClick:l,onPrevBannerClick:r})=>{const s=t.length<=1;return e(o).createElement(f,{animate:t.length>0,shouldCollapse:s},e(o).createElement(x,null,e(o).createElement(b.ActionBannerList,{banners:t,currentIndex:n}),!s&&e(o).createElement(v,null,e(o).createElement(k,{isVisible:i},e(o).createElement(y,{onClick:r},e(o).createElement(m.IconArrowLeftShort,null))),e(o).createElement(h.default,{numOfItems:t.length,currentIndex:n,maxVisible:5}),e(o).createElement(k,{isVisible:a},e(o).createElement(y,{onClick:l},e(o).createElement(m.IconArrowRightShort,null))))))})),w=()=>{const t=(()=>{const{data:t={banners:[]}}=u.hooks.useActionBanners({platform:"extension",appVersion:(0,g.getManifestVersion)()}),{data:n}=u.hooks.useSelectedMultiChainAccountIdentifier(),{banners:a}=t,i=e(s)(n),[l,c]=(0,o.useState)(0),m=(0,o.useCallback)((()=>{c((e=>e+1))}),[]),p=(0,o.useCallback)((()=>{c((e=>e-1))}),[]);return(0,o.useEffect)((()=>{if(a.length&&n)if(i!==n)c(0);else if(l>=a.length)c(a.length-1);else{const e=a[l],t=(0,r.generateActionBannerBaseAnalyticsPayload)(e);d.actionBannerAnalytics.onBannerSeen(t)}}),[l,a,n,i]),(0,o.useMemo)((()=>({banners:a,currentIndex:l,hasNextBanner:l<a.length-1,hasPrevBanner:l>0,onNextBannerClick:m,onPrevBannerClick:p})),[a,l,p,m])})();return e(o).createElement(E,Object.assign({},t))},S=({isReadOnlyAccount:t})=>{const{data:[n]}=(0,l.useFeatureFlags)(["kill-action-banners"]);return t||n?null:e(o).createElement(w,null)}})),n.register("c3wGO",(function(e,a){t(e.exports,"actionBannerAnalytics",(function(){return r}));var i=n("8NH57"),l=n("h5kyv");const r=new(0,i.ActionBannerAnalytics)(l.analytics)})),n.register("57LGC",(function(a,i){t(a.exports,"default",(function(){return d}));var l=n("lDSNw"),r=n("cZIbv");const o=r.default.div`
  display: flex;
  justify-content: ${e=>e.shouldCenter?"center":"flex-start"};
  align-items: center;
  position: relative;
  overflow: hidden;
  width: ${e=>9*(e.maxVisible-1)+18}px;
`,s=r.default.div`
  align-items: center;
  display: flex;
  ${e=>e.shouldShift&&r.css`
      transform: translateX(calc(-${9}px * ${e.shiftAmount}));
      transition: transform 0.3s ease-in-out;
    `}
`,c=r.default.div`
  align-items: center;
  background-color: #999999;
  border-radius: 95px;
  display: flex;
  height: ${5}px;
  justify-content: center;
  margin: 0 ${2}px;
  min-width: ${5}px;
  transition: all 0.3s ease-in-out;
  ${e=>e.isActive&&r.css`
      min-width: ${14}px;
    `}
  ${e=>e.isSmall&&r.css`
      min-width: 3px;
      margin: 0 ${2}px;
      height: 3px;
    `}
`,u=r.default.div`
  width: ${14}px;
  height: ${5}px;
  border-radius: 95px;
  position: absolute;
  margin: 0 ${2}px;
  background-color: #ab9ff2;
  transition: transform 0.3s ease-in-out;
  ${e=>e.position&&r.css`
      transform: translateX(${9*e.position}px);
    `}
`;var d=({numOfItems:t,currentIndex:n,maxVisible:a=5})=>{const i=t>a&&n>a-3,r=i?n-(a-3):0;return e(l).createElement(o,{shouldCenter:a>t,maxVisible:a},e(l).createElement(s,{shouldShift:i,shiftAmount:r},Array.from({length:t}).map(((t,a)=>{const r=(a===n-2||a===n+2)&&i;return e(l).createElement(c,{key:`pagination-dot-${a}`,isActive:n===a,isSmall:r})})),e(l).createElement(u,{position:n})))}})),n.register("eayxI",(function(a,i){t(a.exports,"ActionBannerList",(function(){return u}));var l=n("lDSNw"),r=n("cZIbv"),o=n("8BRi0");const s=r.default.ul`
  align-items: center;
  display: flex;
  margin-bottom: 8px;
  transition: transform 0.5s ease;
  transform: ${e=>`translateX(${-100*e.currentIndex}%)`};
`,c=r.default.li`
  align-items: center;
  display: flex;
  height: 74px;
  flex: 0 0 100%;
  padding: ${e=>e.isActive?"0":e.isNext||e.isPrevious?"0 6px":"0"};
`,u=({banners:t,currentIndex:n})=>e(l).createElement(s,{currentIndex:n},t.map(((t,a)=>e(l).createElement(c,{key:t.id,isActive:n===a,isNext:n+1===a,isPrevious:n-1===a},e(l).createElement(o.ActionBannerListItem,{banner:t,isActive:n===a})))))})),n.register("8BRi0",(function(a,i){t(a.exports,"ActionBannerListItem",(function(){return w}));var l=n("lMzyG"),r=n("8NH57"),o=n("c1thM"),s=n("lDSNw"),c=n("cZIbv"),u=n("gMNJN"),d=n("jl49C"),g=n("2LZGp"),m=n("c3wGO"),p=n("laYjG"),h=n("aanFI"),b=n("kn91D");const f=(0,c.default)(o.motion.button)`
  background: none;
  background-color: rgba(60, 49, 91, 0.4);
  border: 1px solid rgb(60, 49, 91);
  border-radius: 8px;
  cursor: pointer;
  height: ${e=>e.isActive?74:.9*74}px; /* 0.9 is taken from parallaxAdjacentItemScale from the carousel on mobile */
  padding: 10px 12px;
  width: 100%;

  &:hover {
    background-color: rgba(60, 49, 91, 0.6);
  }
`,x=(0,c.default)(o.motion.div)`
  align-items: center;
  display: flex;
`,y=c.default.img`
  margin-right: 12px;
  width: 44px;
`,k=(0,c.default)(b.Text).attrs({lineHeight:17,size:14})`
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  display: -webkit-box;
  flex: 1;
  overflow: hidden;
  text-align: left;
`,v=c.default.div`
  position: relative;
  top: -15px;
  right: -3px;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  display: flex;
  height: 20px;
  justify-content: center;
  width: 20px;
`,E=e(s).memo((({banner:t,isActive:n,onClickBanner:a,onCloseBanner:i})=>e(s).createElement(f,{layout:!0,onClick:a,isActive:n},e(s).createElement(x,{layout:!0},e(s).createElement(y,{src:t.imageUrl}),e(s).createElement(k,{weight:600},t.description),e(s).createElement(v,{onClick:i},e(s).createElement(h.IconClose,{fill:"#ffffff",width:8})))))),w=t=>{const n=(({banner:t,isActive:n})=>{const{t:a}=(0,l.useTranslation)(),i=(0,d.useDeepLink)(),{mutateAsync:o}=u.hooks.useDismissActionBanner(),{handleShowModalVisibility:c,handleHideModalVisibility:h}=(0,g.useModals)(),b=(0,s.useCallback)((n=>{const l=(0,r.generateActionBannerBaseAnalyticsPayload)(t);switch(m.actionBannerAnalytics.onBannerClick(l),t.bannerType){case r.ActionBannerType.DirectLink:{const{destinationType:e,url:a}=t;i(n,{destinationType:e,url:a});break}case r.ActionBannerType.Modal:{const{interstitial:l,destinationType:o,url:u}=t,{title:d,lineItems:g=[],imageUrl:b,primaryButtonText:f=a("commandContinue"),secondaryButtonText:x=a("commandDismiss")}=l,y=(0,r.generateActionBannerInterstitialAnalyticsPayload)(t),k=g.map((e=>({icon:e.imageUrl,subtitle:e.description,title:e.title})));c("interstitial",{bodyTitle:d,details:k,icon:b,onDismiss:()=>{m.actionBannerAnalytics.onInterstitialDismiss(y)},FooterComponent:()=>e(s).createElement(p.ButtonPair,{primaryText:f,secondaryText:x,onPrimaryClicked:()=>{i(n,{destinationType:o,url:u}),m.actionBannerAnalytics.onInterstitialPrimaryClick(y),h("interstitial")},onSecondaryClicked:()=>{m.actionBannerAnalytics.onInterstitialSecondaryClick(y),h("interstitial")}})}),m.actionBannerAnalytics.onInterstitialSeen(y);break}}}),[t,c,h,a,i]),f=(0,s.useCallback)((e=>{e.stopPropagation(),o({actionBannerId:t.id});const n=(0,r.generateActionBannerBaseAnalyticsPayload)(t);m.actionBannerAnalytics.onBannerDismiss(n)}),[t,o]);return(0,s.useMemo)((()=>({isActive:n,banner:t,onClickBanner:b,onCloseBanner:f})),[t,n,b,f])})(t);return e(s).createElement(E,Object.assign({},n))}})),n.register("jl49C",(function(a,i){t(a.exports,"useDeepLink",(function(){return m}));var l=n("8NH57"),r=n("lDSNw"),o=n("lz7nT"),s=n("aXzxc"),c=n("7J3aJ"),u=n("8182A"),d=n("d1qx3"),g=n("lrImj");const m=()=>{const{showSettingsMenu:t}=(0,c.useSettingsMenu)(),{showBuyFungibleSelectionModal:n}=(0,s.useLegacyModals)(),a=(0,o.useNavigate)();return(0,r.useCallback)(((i,o)=>{const{destinationType:s,url:c}=o;switch(s){case l.DeepLinkDestination.ExternalLink:(0,d.openTabAsync)({url:c});break;case l.DeepLinkDestination.Buy:n();break;case l.DeepLinkDestination.Collectibles:a(u.Path.Collectibles);break;case l.DeepLinkDestination.Explore:a(u.Path.Explore);break;case l.DeepLinkDestination.Quests:a(u.Path.Explore,{state:{tab:"quests",date:Date.now()}});break;case l.DeepLinkDestination.Swapper:a(u.Path.Swap);break;case l.DeepLinkDestination.SettingsImportSeedPhrase:(0,d.openTabAsync)({url:"onboarding.html?append=true"});break;case l.DeepLinkDestination.ConnectHardwareWallet:(0,d.openTabAsync)({url:"connect_hardware.html"});break;default:{const n=(0,g.getSanityComponentMapping)(s);if(!n)return;t(i,e(r).createElement(n,null))}}}),[a,t,n])}})),n.register("lrImj",(function(e,a){t(e.exports,"getSanityComponentMapping",(function(){return r}));var i=n("8NH57"),l=n("i14LG");const r=e=>{if(e===i.DeepLinkDestination.SettingsSecurityAndPrivacy)return l.MultiChainSecurity}})),n.register("hjWkM",(function(a,i){t(a.exports,"CTABar",(function(){return b}));var l=n("jlKgL"),r=n("lDSNw"),o=n("cZIbv"),s=n("2LZGp"),c=n("iyZMg"),u=n("dTI5G");const d=o.default.div`
  display: grid;
  grid-gap: 8px;
  grid-template-columns: ${e=>`repeat(${e.buttonCount}, minmax(0, 1fr));`};
  width: 100%;
  height: 74px;
`,g=o.default.button`
  display: flex;
  border: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px;
  border-radius: 16px;
  gap: 4px;
  font-size: 12px;
  font-style: normal;
  font-weight: 600;
  line-height: 16px;
  cursor: pointer;

  &:disabled {
    cursor: default;
  }
`,m=o.default.div`
  height: 24px;
  overflow: hidden;
`,p=(0,o.default)(g)`
  background: #2a2a2a;
  * {
    color: ${e=>e.theme.grayLight};
  }
  &:hover:enabled {
    background: #333333;
  }
`,h=(0,o.default)(g)`
  background: #2a2a2a;
  * {
    color: ${e=>e.theme.grayLight};
  }
  &:hover:enabled {
    background: #333333;
  }
`;function b({actions:t,shortcuts:n,hostname:a,headerText:i,maxButtons:o=4,uiContextName:g,disabled:b=!1}){var f;const x=(0,r.useMemo)((()=>t.length>o?t.slice(o-1):[]),[t,o]),y=(0,r.useMemo)((()=>x.length>0?t.slice(0,o-1):t),[t,x,o]),k=t.length+(null!==(f=null==n?void 0:n.length)&&void 0!==f?f:0),{handleShowModalVisibility:v,handleHideModalVisibility:E}=(0,s.useModals)(),w=(0,r.useCallback)(((e,t)=>{c.fungibleAnalytics.ctaBarTrackPrimaryButtonsClick({uiContext:{name:g},position:t,type:e,maxButtons:o,primaryActions:y,moreActions:x})}),[o,x,y,g]);return e(r).createElement(d,{buttonCount:Math.min(t.length,o)},y.map((t=>{var n;return e(r).createElement(p,{disabled:b,key:t.type,type:"button",onClick:()=>{w(t.type,"primary"),t.onClick(t.type)}},e(r).createElement(m,null,e(r).createElement(u.CTAIcon,{color:b?"gray":"accentPrimary",type:t.type})),e(r).createElement("span",null,null!==(n=t.singleWordAltText)&&void 0!==n?n:t.text))})),x.length>0?e(r).createElement(h,{disabled:b,type:"button",onClick:()=>{c.fungibleAnalytics.ctaBarTrackMoreButtonClick({uiContext:{name:g},maxButtons:o,totalButtons:k}),v("callToActionSheet",{headerText:i,actions:x,shortcuts:n,hostname:a,onClose:()=>{E("callToActionSheet")},trackAction:e=>{w(e,"more")}})}},e(r).createElement(l.icons.MoreHorizontal,{size:24,color:"accentPrimary"}),e(r).createElement("span",null,"More")):null)}})),n.register("iyZMg",(function(e,a){t(e.exports,"fungibleAnalytics",(function(){return r}));var i=n("gYh0e"),l=n("h5kyv");const r=new(0,i.FungibleAnalytics)(l.analytics)})),n.register("e9bgh",(function(a,i){t(a.exports,"Header",(function(){return L})),t(a.exports,"getButtonState",(function(){return O}));var l=n("lMzyG"),r=n("4QHep"),o=n("jlKgL"),s=n("4y59b"),c=n("lDSNw"),u=n("gmVmN"),d=n("cZIbv"),g=n("44I6u"),m=n("aanFI"),p=n("6l2nq"),h=n("goqEN"),b=n("hjnIF"),f=n("kn91D"),x=n("ibYAx"),y=n("e8X5Q");const k=(0,d.default)(g.Column).attrs({align:"center"})`
  width: ${x.PHANTOM_WIDTH}px;
  margin-top: -16px;
  background: ${e=>e.background};
`,v=(0,d.default)(g.Column).attrs({align:"center"})`
  margin-top: 2rem;
`,E=(0,d.default)(g.Column).attrs({align:"center",justify:"center",width:"100%"})`
  height: 5.3rem;
`,w=(0,d.default)(b.SkeletonLoader).attrs({height:"8px",borderRadius:"6px",backgroundColor:"#484848"})`
  opacity: 0.2;
`,S=(0,d.default)(p.Row)`
  height: 8px;
  border-radius: 6px;
  background-color: ${(0,s.hexToRGB)("#999999",.5)};
  opacity: 0.5;
`,A=(0,d.default)(h.ShrinkingText)`
  margin-bottom: 11px;
`,T=d.default.div`
  display: flex;
  flex-direction: row;
  padding: 16px 5px;
  justify-content: center;
  align-items: center;
  gap: 6px;
  flex: 1 0 0;
  border-radius: 62px;
  backdrop-filter: blur(2px);
  background: rgba(0, 0, 0, 0.2);
`,M=(0,d.default)(f.Text).attrs({size:15,weight:"600",color:"#FFF",lineHeight:20})``,C=(0,d.default)(f.Text).attrs({size:36,weight:"bold",color:"#777"})``,D=(0,d.default)(p.Row).attrs({justify:"center"})``,B=(0,d.default)(f.Text).attrs({weight:500,size:18})`
  margin-right: 6px;
`,F=(0,d.default)(f.Text).attrs({weight:500,size:18})`
  border-radius: 6px;
  padding: 2px 5px;
`,I=d.default.div`
  display: flex;
  flex-direction: row;
  gap: 8px;
  width: 326px;
  margin-top: 2rem;
  margin-bottom: 22px;
  > * {
    box-shadow: 0px 2px 6px rgba(0, 0, 0, 0.16);
  }
`,N=d.default.div`
  padding: 16px;
  padding-bottom: 0px;
`,L=e(c).memo((({enableCTABar:t,buyButtonText:n,receiveButtonText:a,hasFungibles:i,isErrorTokens:r,isLoading:u,isHidingAllFungibles:d,isReadOnlyAccount:g,showBuyFungibleSelectionModal:p,showDepositListModal:h,showSendFungibleSelectionModal:b,value:f,earnings:x,prefetchSPLTokenMap:L,sendButtonText:W,showDollarValues:$,shouldShowPartialError:j,partialErrorMessage:U})=>{const{t:G}=(0,l.useTranslation)(),Z=z(x),K=P({earnings:x,isNeutral:!$||u||d}),_=H(f),Q=R(x),J=V(f,x),{buttonTheme:X,buttonDisabled:Y}=O({isLoading:u,isEnabled:i||d,isErrorTokens:r});return e(c).createElement(k,{background:K},j?e(c).createElement(N,null,e(c).createElement(y.PartialErrorBanner,{partialErrorMessage:U})):null,e(c).createElement(v,null,$?u?e(c).createElement(E,null,e(c).createElement(w,{width:"184px",margin:"0 0 10px 0"}),e(c).createElement(w,{width:"112px"})):i||d?e(c).createElement(e(c).Fragment,null,e(c).createElement(A,{maxFontSize:38,fontWeight:600},_),e(c).createElement(D,null,e(c).createElement(B,{color:Z},Q),e(c).createElement(F,{color:Z,backgroundColor:(0,s.hexToRGB)(Z,.1)},J))):r?e(c).createElement(E,null,e(c).createElement(S,{width:"184px",margin:"0 0 10px 0"}),e(c).createElement(S,{width:"112px"})):null:e(c).createElement(E,null,e(c).createElement(C,null,"–"))),g?e(c).createElement(I,null,e(c).createElement(T,null,e(c).createElement(m.IconEye,{width:20,height:20,fill:"#FFFFFF"}),e(c).createElement(M,null,G("readOnlyAccountBannerWarning")))):!t&&e(c).createElement(I,null,e(c).createElement(o.Button,{onMouseEnter:L,onClick:h,disabled:Y,variant:{theme:X}},a),e(c).createElement(o.Button,{onClick:p,variant:{theme:X},disabled:Y},n),e(c).createElement(o.Button,{onClick:b,variant:{theme:X},disabled:Y},W)))})),P=({earnings:e,isNeutral:t})=>t||void 0===e||0===e?"linear-gradient(180deg, rgba(136, 136, 136, 0.05) 0%, rgba(136, 136, 136, 0) 100%)":e>0?"linear-gradient(180deg, rgba(33, 229, 111, 0.05) 0%, rgba(33, 229, 111, 0) 100%)":"linear-gradient(180deg, rgba(235, 55, 66, 0.05) 0%, rgba(235, 55, 66, 0) 100%)",z=e=>void 0===e||0===e?"#777777":e>0?"#21E56F":"#EB3742",H=e=>void 0===e?"-":0===e?"$0.00":(0,u.formatDollarAmount)(e),R=e=>void 0===e?"-":0===e?"+$0.00":(0,u.formatDollarAmount)(e,{includePlusPrefix:!0}),V=(e,t)=>{const n=void 0===t;return void 0===e||n?"-":`${n||t>=0?"+":"-"}${Math.abs((0,r.calculatePercentChange)(e-t,e)).toFixed(2)}%`},O=({isLoading:e,isEnabled:t,isErrorTokens:n})=>{let a="primary",i=!1;switch(!0){case e:a="secondary",i=!0;break;case t:a="primary",i=!1;break;case n:a="secondary",i=!0}return{buttonTheme:a,buttonDisabled:i}}})),n.register("goqEN",(function(a,i){t(a.exports,"ShrinkingText",(function(){return d}));var l=n("lDSNw"),r=n("cZIbv"),o=n("gw3Qt"),s=n("kn91D");const c=r.default.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: ${e=>`${e.fontSize}px`};
  width: 100%;
`,u=(0,r.default)(s.Text)`
  font-size: ${e=>e.fontSize};
  line-height: 120%;
  font-weight: ${e=>e.fontWeight};
`,d=e(l).memo((({children:t,className:n,maxFontSize:a,fontWeight:i=500})=>{const[r,s]=(0,o.useFitText)();return e(l).createElement(c,{className:n,ref:s,fontSize:a},e(l).createElement(u,{fontSize:r,weight:i,noWrap:!0},t))}))})),n.register("gw3Qt",(function(e,a){t(e.exports,"useFitText",(function(){return l}));var i=n("lDSNw");const l=()=>{const e=(0,i.useRef)(null),[t,n]=(0,i.useState)({fontSize:100,fontSizePrev:20,fontSizeMax:100,fontSizeMin:20}),{fontSize:a,fontSizeMax:l,fontSizeMin:r,fontSizePrev:o}=t;return(0,i.useEffect)((()=>{const t=Math.abs(a-o)<=5,i=null!==e.current&&(e.current.scrollHeight>e.current.offsetHeight||e.current.scrollWidth>e.current.offsetWidth),s=a>o;if(t){if(i){n({fontSize:o<a?o:a-(o-a),fontSizeMax:l,fontSizeMin:r,fontSizePrev:o})}return}let c,u=l,d=r;i?(c=s?o-a:r-a,u=Math.min(l,a)):(c=s?l-a:o-a,d=Math.max(r,a)),n({fontSize:a+c/2,fontSizeMax:u,fontSizeMin:d,fontSizePrev:a})}),[a,l,r,o,e]),[`${a}%`,e]}})),n.register("e8X5Q",(function(a,i){t(a.exports,"PartialErrorBanner",(function(){return d}));var l=n("lDSNw"),r=n("cZIbv"),o=n("aanFI"),s=n("kn91D");const c=r.default.div`
  background: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(54px);
  padding: 16px;
  border-radius: 16px;
  width: 100%;
  display: flex;
  gap: 8px;
  position: relative;
`,u=(0,r.default)(s.Text)`
  color: #999999;
  font-size: 14px;
  line-height: 17px;
  font-weight: 400;
  text-align: left;
  padding: 1px 0;
`,d=({partialErrorMessage:t})=>e(l).createElement(c,null,e(l).createElement("div",null,e(l).createElement(o.IconInfoCircle,{width:18,height:18,fill:"#999999"})),e(l).createElement(u,null,t))})),n.register("iKm61",(function(a,i){t(a.exports,"HomeError",(function(){return f}));var l=n("lDSNw"),r=n("cZIbv"),o=n("44I6u"),s=n("aanFI"),c=n("6l2nq"),u=n("kn91D");const d=(0,r.default)(o.Column).attrs({align:"center"})``,g=r.default.div`
  width: 48px;
  height: 48px;
  position: relative;
  margin-bottom: 15px;
  border-radius: 100%;
  background: rgba(255, 220, 98, 0.2);
`,m=(0,r.default)(c.Row).attrs({align:"center",justify:"center"})`
  height: 100%;
`,p=(0,r.default)(u.Text).attrs({size:17,weight:500,lineHeight:22,margin:"0 0 10px 0"})``,h=(0,r.default)(u.Text).attrs({size:15,weight:500,lineHeight:21,margin:"0 0 15px 0",color:"#777777"})``,b=(0,r.default)(u.Text).attrs({size:16,weight:500,lineHeight:22,margin:"0",color:"#AB9FF2"})``,f=e(l).memo((t=>e(l).createElement(d,null,e(l).createElement(g,null,e(l).createElement(m,null,e(l).createElement(s.IconExclamationMarkCircle,{width:22,exclamationFill:"transparent",circleFill:"#FFE920"}))),e(l).createElement(p,null,t.title),e(l).createElement(h,null,t.description),e(l).createElement(b,{onClick:t.refetch},t.buttonText))))})),n.register("iTDlK",(function(a,i){t(a.exports,"ManageTokenListButton",(function(){return m}));var l=n("lDSNw"),r=n("cZIbv"),o=n("aanFI"),s=n("3ou76"),c=n("6l2nq"),u=n("kn91D");const d=(0,r.default)(c.Row).attrs({justify:"center",margin:"0 auto",width:"auto"})`
  cursor: pointer;
  height: 48px;
  margin-bottom: 10px;
  p {
    font-weight: 500;
  }
  &:hover {
    p {
      color: #ab9ff2 !important;
    }
    svg {
      fill: #ab9ff2;
      path {
        stroke: #ab9ff2;
      }
      circle {
        stroke: #ab9ff2;
      }
    }
  }
`,g=(0,r.default)(u.Text).attrs({size:16,color:"#777777",weight:500,margin:"0 0 0 10px",lineHeight:19,noWrap:!0})``,m=e(l).memo((t=>e(l).createElement(d,{onClick:t.onClick},e(l).createElement(s.IconWrapper,null,e(l).createElement(o.IconTokenListSettings,null)),e(l).createElement(g,null,t.buttonText))))})),n.register("1j4wJ",(function(e,a){t(e.exports,"useWalletBalanceAnalytics",(function(){return o}));var i=n("lDSNw"),l=n("iyZMg"),r=n("gMNJN");function o(e,t,n){const a=r.hooks.useIsTestnetMode(),[o,s]=(0,i.useState)(!1);(0,i.useEffect)((()=>{a||s(!1)}),[n,a]),(0,i.useEffect)((()=>{!o&&t.length&&e.length&&!a&&(l.fungibleAnalytics.walletBalance(n,t,e),s(!0))}),[n,t,e,o,a])}})),n.register("8egSn",(function(a,i){t(a.exports,"FungibleDetailPage",(function(){return Q}),(function(e){return Q=e}));var l=n("6Tvfa"),r=n("belzv"),o=n("lBuGR"),s=n("gYh0e"),c=n("5VjGu"),u=n("lMzyG"),d=n("4raQz"),g=n("4y59b"),m=n("kd2w2"),p=n("3yHS8"),h=n("lDSNw"),b=n("lz7nT"),f=n("NQvFB"),x=n("cZIbv"),y=n("hjWkM"),k=n("jQk2k"),v=n("aLflh"),E=n("aanFI"),w=n("1yzIb"),S=n("lLIZI"),A=n("aXzxc"),T=n("fskOJ"),M=n("7CjHJ"),C=n("jBYwZ"),D=n("2pb0B"),B=n("1HSLJ"),F=n("3OE1H"),I=n("e8X5Q"),N=n("lKTPx"),L=n("gMNJN"),P=n("2XM7d"),z=n("2LZGp"),H=n("1yIB4"),R=n("8182A"),V=n("h5kyv"),O=function(e,t,n,a){return new(n||(n=Promise))((function(i,l){function r(e){try{s(a.next(e))}catch(e){l(e)}}function o(e){try{s(a.throw(e))}catch(e){l(e)}}function s(e){var t;e.done?i(e.value):(t=e.value,t instanceof n?t:new n((function(e){e(t)}))).then(r,o)}s((a=a.apply(e,t||[])).next())}))};const W=e(p)(0),$=x.default.div`
  margin: 24px 0 0 0;
  width: 100%;
`,j=x.default.div`
  margin: 24px 0 0 0;
  width: 100%;
`,U=x.default.div`
  margin-bottom: 9px;
  width: 100%;
`,G=x.default.div`
  margin-top: 16px;
  margin-bottom: 24px;
  width: 100%;
`,Z=x.default.div`
  padding-bottom: 16px;
`,K=e=>{const{fungibleKey:t}=e,{data:[n=!1,a]}=(0,o.useFeatureFlags)(["enable-asset-details","enable-cta-bar"]),{t:i}=(0,u.useTranslation)(),{data:l}=L.hooks.useSelectedMultiChainAccount(),c=null==l?void 0:l.isReadOnly,{addresses:d}=(0,h.useMemo)((()=>{var e,t;return{addresses:null!==(e=null==l?void 0:l.addresses)&&void 0!==e?e:[],accountIdentifier:null!==(t=null==l?void 0:l.identifier)&&void 0!==t?t:""}}),[l]),{fungible:g}=L.hooks.useFungible({key:t}),{fungible:p}=L.hooks.useFungible({key:s.FungibleTokenType.SolanaNative}),x=(null==g?void 0:g.type)===s.FungibleTokenType.SolanaNative&&!c,y=void 0!==g?(0,s.parseOwnerAddress)(g):"",k=L.hooks.useFungibleExplorerUrl(g),{explorerName:v,explorerUrl:E}={explorerName:null==k?void 0:k.explorerName,explorerUrl:null==k?void 0:k.explorerUrl},w=(0,h.useMemo)((()=>({viewInExplorer:i("assetDetailViewOnExplorer",{explorer:v}),stakeSolText:i("assetDetailStakeSOL"),unwrapAllText:i("assetDetailUnwrapAll"),unwrappingSOLText:i("assetDetailUnwrappingSOL"),copyAddress:i("commandCopyTokenAddress"),reportSpam:i("commandReportAsSpam")})),[v,i]),{showValidatorListModal:S,hideValidatorListModal:T}=(0,A.useLegacyModals)(),M=(0,b.useNavigate)(),{mutateAsync:C}=L.hooks.useUnwrapSOL(),D=(0,s.useTokenAddressFromFungible)(g),{mutateAsync:B}=L.hooks.useSetVisibilityOverrides(),F=(0,h.useMemo)((()=>{const e=[];if((null==g?void 0:g.type)===s.FungibleTokenType.SPL&&g.data.mintAddress===m.NATIVE_MINT.toBase58()){const t=p,n=d.find(r.isSolanaChainAddress);!!g.data.splTokenAccountPubkey&&void 0!==n&&!!t&&+t.data.amount>f.DEFAULT_FEE.toNumber()&&!c&&e.unshift({key:"unwrap-all",label:w.unwrapAllText,onClick:()=>{O(void 0,void 0,void 0,(function*(){yield C(),M(R.Path.Notifications)}))}})}if(y&&!n){e.push({key:"view-in-explorer",label:w.viewInExplorer,onClick:()=>{window.open(E,"_blank")}}),D&&e.push({key:"copy-address",label:w.copyAddress,onClick:()=>{(0,P.copyToClipboard)(D)}});const t=(0,s.getHandleMarkAsSpam)({analytics:V.analytics,fungible:g,accountId:null==l?void 0:l.identifier,setVisibilityOverrides:B});t&&e.push({variant:H.CTAVariant.Warning,key:"report-spam",label:w.reportSpam,onClick:t})}return x&&!n&&e.push({key:"stake-sol",label:w.stakeSolText,onClick:()=>S({onClose:T})}),e}),[g,y,x,p,d,w.unwrapAllText,w.viewInExplorer,w.stakeSolText,w.copyAddress,w.reportSpam,C,M,E,S,T,n,c,D,B,null==l?void 0:l.identifier]);return a?[]:F},_=e(h).memo((t=>{var n;const{enableCTABar:a,chainAddress:i,fungible:l,fungibleName:r,actionItems:u,tokenAddress:d,fungibleSymbol:m,fungibleBalance:p,fungiblePrice:b,fungibleTokenType:f,fungiblePermanentDelegate:x,summaryItems:A,canStake:M,showUnwrapBlurEth:N,showDollarValue:L,i18nStrings:P,accounts:H,pageHeader:R,isDeveloperMode:V,developerModeStatus:O,handleShowSendModal:W,handleShowDepositFungibleModal:K,handleSwapClick:_,enableAssetDetails:Q,isReadOnlyAccount:J,isSplNonTransferable:X,derivedSpamStatus:Y,onMarkNotSpam:q,ctaActions:ee,shouldShowPartialError:te,partialErrorMessage:ne}=t,ae=e(h).createElement(e(h).Fragment,null,e(h).createElement(k.PageHeader,{isSticky:!0,items:u.length>0?u:void 0},R),te?e(h).createElement(Z,null,e(h).createElement(I.PartialErrorBanner,{partialErrorMessage:ne})):null,e(h).createElement(U,null,Q&&l?e(h).createElement(e(h).Fragment,null,e(h).createElement(D.FungibleSummaryCard,{type:l.type,chain:l.data.chain,logoUri:l.data.logoUri,name:l.data.name,price:l.data.price,priceChange24h:l.data.priceChange24h,symbol:l.data.symbol,tokenAddress:l.data.tokenAddress})):e(h).createElement(T.FungibleDetailHeader,{enableCTABar:a,chainAddress:i,balance:p,symbol:m,mint:d,dollarValue:b,fungibleTokenType:f,showDollarValue:L,sendButtonText:P.sendButtonText,receiveButtonText:P.receiveButtonText,swapButtonText:P.swapButtonText,handleShowSendModal:W,handleShowDepositFungibleModal:K,handleSwapClick:_,isReadOnlyAccount:J,isSplNonTransferable:X}),a&&!J&&e(h).createElement(G,null,e(h).createElement(y.CTABar,{actions:ee,uiContextName:"fungibleDetail"})),Y===s.SpamStatus.PossibleSpam&&e(h).createElement(j,null,e(h).createElement(w.WarningCardWithActions,{message:P.spamWarning,variant:"warning",Icon:E.IconEyeOff,actions:[(null==l?void 0:l.data.spamStatus)===s.SpamStatus.PossibleSpam&&{label:P.reportAsNotSpam,onClick:q}].filter(g.filterBoolean)})),M&&e(h).createElement($,null,e(h).createElement(B.StartEarningSol,null)),N&&l?e(h).createElement($,null,e(h).createElement(F.ButtonUnwrapFungible,{fungible:l})):null,x&&e(h).createElement(j,null,e(h).createElement(S.WarningDialog,{message:P.permanentDelegateWarning,variant:2})),A.length>0?e(h).createElement(C.FungibleSummary,{name:r,items:A}):null)),ie=(0,c.useFetchInfiniteHistoryItems)(H),le=ie.isLoading||"loading"===O,{isError:re}=(0,c.useFetchRefreshInfiniteHistoryItems)(H),{handleShowModalVisibility:oe}=(0,z.useModals)(),se=(0,h.useCallback)((e=>oe("historyItem",e)),[oe]),ce=(0,h.useCallback)((e=>oe("pendingTransaction",e)),[oe]),{data:[ue=!1]}=(0,o.useFeatureFlags)(["enable-spam-filtering"]);return void 0===l?ae:e(h).createElement(v.HistoryList,Object.assign({header:ae,dataPages:null===(n=ie.data)||void 0===n?void 0:n.pages,isLoading:le,fetchNextPage:ie.fetchNextPage,refetch:ie.refetch,hasNextPage:ie.hasNextPage,isFetchingNextPage:ie.isFetchingNextPage,isError:ie.isError,isRefreshError:re,isRefreshingConfirmedTxs:!1,isDeveloperMode:V,showHistoryItemModal:se,showPendingTransactionModal:ce},ue?{filter:e=>!(0,c.isSpamTransaction)(e,i?[i]:[])}:{}))})),Q=e(h).memo((t=>{const{data:n,loading:a}=(e=>{var t;const{networkID:n,fungibleKey:a,name:i,symbol:m,tokenAddress:p,walletAddress:x}=e,{data:[y=!1,k,v]}=(0,o.useFeatureFlags)(["enable-asset-details","enable-cta-bar","kill-brc20-sends"]),{showSendFungibleFormModal:E,showDepositFungibleModal:w,hideDepositFungibleModal:S}=(0,A.useLegacyModals)(),{data:T,isLoading:M}=L.hooks.useSelectedMultiChainAccount(),C=null==T?void 0:T.isReadOnly,{data:D=l.DEFAULT_DEVELOPER_MODE,status:B}=L.hooks.useDeveloperMode(),F=D.isDeveloperMode,{fungibles:I,isLoadingTokens:z,refetch:H,visibilityOverrides:$}=L.hooks.useFungibles(),j=(0,s.useFungiblesStore)((e=>e.setSendFungibleKey)),{fungible:U,fungibleName:G,fungibleSymbol:Z,fungibleBalance:_,fungiblePrice:Q,fungibleTokenType:J,fungiblePermanentDelegate:X}=(0,h.useMemo)((()=>{var e,t,n;const l=I.find((e=>e.data.key===a)),r=(0,s.getPermananetDelegateAddress)(l);return{fungible:l,fungibleName:null!==(e=null==l?void 0:l.data.name)&&void 0!==e?e:i,fungibleSymbol:null!==(t=null==l?void 0:l.data.symbol)&&void 0!==t?t:m,fungibleBalance:null!==(n=null==l?void 0:l.data.balance)&&void 0!==n?n:W,fungiblePrice:null==l?void 0:l.data.usd,fungibleTokenType:null==l?void 0:l.type,fungiblePermanentDelegate:r}}),[a,I,i,m]),Y=(0,s.getDerivedSpamStatus)($,{key:a,spamStatus:null!==(t=null==U?void 0:U.data.spamStatus)&&void 0!==t?t:s.SpamStatus.NotVerified}),{data:q}=L.hooks.useSelectedChainAddress({networkID:n,address:null==U?void 0:U.data.walletAddress}),{t:ee}=(0,u.useTranslation)(),te=(0,h.useMemo)((()=>({recentActivityText:ee("assetDetailRecentActivity"),sendButtonText:ee("commandSend"),receiveButtonText:ee("commandReceive"),swapButtonText:ee("commandSwap"),permanentDelegateWarning:ee("assetDetailPermanentDelegateWarning",{delegate:X}),spamWarning:ee("tokenSpamWarning"),reportAsNotSpam:ee("commandReportAsNotSpam")})),[ee,X]),ne=G,ae=(0,g.truncateString)(ne,20),ie=(0,c.getTokenHistoryFilterId)(U),le=(0,h.useMemo)((()=>{const e=q?[q]:[];return(0,c.getAccountsWithFilter)(e,n,ie)}),[q,n,ie]),re=(null==U?void 0:U.data.tokenAddress)===s.BLUR_ETH_MINT_ADDRESS&&!C,oe=(0,h.useCallback)((()=>{U&&(j(null==U?void 0:U.data.key),E(U))}),[U,j,E]),se=(0,h.useCallback)((()=>{var e;w({accountName:null!==(e=null==T?void 0:T.name)&&void 0!==e?e:"",walletAddress:x,address:p,symbol:Z,onClose:S,networkID:n})}),[null==T?void 0:T.name,S,p,x,w,Z,n]),ce=!r.Chains.isSolanaNetworkID(n)||"mainnet-beta"===(0,d.getClusterBySolanaChainId)(n),{isSolana:ue}=(0,h.useMemo)((()=>{const e=I.find((e=>e.data.key===a));return{isSolana:(null==e?void 0:e.type)===s.FungibleTokenType.SolanaNative}}),[a,I]),de=ue&&!C,ge=K(e),{summaryItems:me,shouldShowPartialError:pe,partialErrorMessage:he}=L.hooks.useFungibleDetailViewState({fungibleKey:a,account:T}),be=(0,h.useMemo)((()=>{if(U)return(0,r.encodeCaip19)((0,s.getFungibleCaip19FromFungible)(U))}),[U]),fe=(0,N.useNavigateToSwapper)(),xe=(0,h.useCallback)((()=>{U&&be&&(V.analytics.capture("fungibleSwapClick",{data:{caip19:be}}),fe({sellFungible:U}))}),[U,be,fe]),{mutateAsync:ye}=L.hooks.useSetVisibilityOverrides(),ke=(0,h.useCallback)((()=>O(void 0,void 0,void 0,(function*(){U&&(null==T?void 0:T.identifier)&&(V.analytics.capture("fungiblesReportAsNotSpam",{data:{caip19:(0,r.encodeCaip19)((0,s.getFungibleCaip19FromFungible)(U))}}),yield ye({accountId:T.identifier,mutations:[{fungibleKey:U.data.key,visibility:s.VisibilityStatus.VisibleNotSpam}]}))}))),[T,U,ye]),ve=(0,h.useMemo)((()=>(0,s.getIsNonTransferable)(U)),[U]),Ee=L.hooks.useCanSwapWithNetworkID({networkID:null==q?void 0:q.networkID}),{showValidatorListModal:we,hideValidatorListModal:Se}=(0,A.useLegacyModals)(),Ae=(0,h.useCallback)((()=>we({onClose:Se})),[Se,we]),Te=(0,h.useCallback)((()=>{p&&(0,P.copyToClipboard)(p)}),[p]),{mutateAsync:Me}=L.hooks.useUnwrapSOL(),Ce=(0,b.useNavigate)(),De=(0,h.useCallback)((()=>O(void 0,void 0,void 0,(function*(){yield Me(),Ce(R.Path.Notifications)}))),[Ce,Me]),Be=L.hooks.useFungibleExplorerUrl(U),Fe=(0,h.useCallback)((()=>{window.open(null==Be?void 0:Be.explorerUrl,"_blank")}),[null==Be?void 0:Be.explorerUrl]),{ctaActions:Ie}=L.hooks.useFungibleCTAActions({balance:_,canSwap:Ee,chainAddress:q,fee:f.DEFAULT_FEE,fungible:U,isReadOnlyAccount:C,isSplNonTransferable:ve,killBrc20Sends:v,onCopyTokenAccountAddressPress:Te,onDepositPress:se,onMarkNotSpam:ke,onSendPress:oe,onStakeSolPress:Ae,onSwapPress:xe,onUnwrapWrappedSolPress:De,onViewOnExplorerPress:Fe,type:null!=J?J:s.FungibleTokenType.SolanaNative});return{data:(0,h.useMemo)((()=>({enableCTABar:k,chainAddress:q,fungible:U,tokenAddress:p,fungibleName:G,fungibleSymbol:Z,fungibleBalance:_,fungiblePrice:Q,fungibleTokenType:J,fungiblePermanentDelegate:X,summaryItems:me,canStake:de,showUnwrapBlurEth:re,showDollarValue:ce,i18nStrings:te,accounts:le,actionItems:ge,pageHeader:ae,isDeveloperMode:F,developerModeStatus:B,handleShowSendModal:oe,handleShowDepositFungibleModal:se,handleSwapClick:xe,refetch:H,enableAssetDetails:y,walletAddress:x,isReadOnlyAccount:C,isSplNonTransferable:(0,s.getIsNonTransferable)(U),derivedSpamStatus:Y,onMarkNotSpam:ke,ctaActions:Ie,shouldShowPartialError:pe,partialErrorMessage:he})),[k,q,U,p,G,Z,_,Q,J,X,me,de,re,ce,te,le,ge,ae,F,B,oe,se,xe,H,y,x,C,Y,ke,Ie,pe,he]),loading:M||z}})(t);return a?e(h).createElement(M.FungibleDetailLoader,{depositText:n.i18nStrings.receiveButtonText,sendText:n.i18nStrings.sendButtonText}):e(h).createElement(_,Object.assign({},n))}))})),n.register("1yzIb",(function(e,a){t(e.exports,"WarningCardWithActions",(function(){return h}));var i=n("4raQz"),l=n("lDSNw"),r=n("cZIbv"),o=n("aanFI"),s=n("kn91D");const c=r.default.div`
  display: flex;
  flex-direction: column;
  background-color: ${e=>e.color};
  width: 100%;
  border-width: 1px;
  border-style: solid;
  border-color: ${e=>e.color};
  border-radius: 12px;
  gap: 8px;
`,u=r.default.div`
  display: flex;
  margin: 16px;
  gap: 8px;
`,d=r.default.div`
  display: flex;
  justify-content: ${e=>1===e.buttonCount?"center":"space-between"};
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  padding: 4px 8px;
  margin-bottom: 4px;
`,g=r.default.div`
  padding: 3px;
`,m=r.default.button`
  border: none;
  background: transparent;
  color: #222222;
  cursor: pointer;
  padding: 8px;
  &:nth-child(1) {
    font-weight: bold;
  }
`,p=(0,r.default)(s.Text).attrs({size:14,weight:400,lineHeight:17,textAlign:"left",wordBreak:"break-word"})``,h=({message:e,inverted:t=!1,variant:n="warning",actions:a,Icon:r})=>{let s="#2A2A2A",h="#222222";switch(null!=r||(r="warning"!==n||t?o.IconExclamationMarkOctagon:o.IconExclamationMarkTriangle),n){case"warning":default:s=i.simulations.WARNING_COLOR;break;case"danger":s=i.simulations.DANGER_COLOR;break;case"error":h=i.simulations.ERROR_COLOR}return l.createElement(c,{color:s},l.createElement(u,null,l.createElement(g,null,l.createElement(r,{fill:h,width:18,height:18})),l.createElement(p,{color:h},e)),0===a.length?null:l.createElement(d,{buttonCount:a.length},a.map((e=>l.createElement(m,{key:e.label,onClick:e.onClick,type:"button"},e.label)))))}})),n.register("fskOJ",(function(a,i){t(a.exports,"FungibleDetailHeader",(function(){return y}));var l=n("6Tvfa"),r=n("gYh0e"),o=n("lDSNw"),s=n("gmVmN"),c=n("cZIbv"),u=n("laYjG"),d=n("44I6u"),g=n("goqEN"),m=n("kn91D"),p=n("gMNJN"),h=n("h5kyv");const b=(0,c.default)(d.Column).attrs({align:"center"})`
  background: #2a2a2a;
  padding: 16px 14px;
  border-radius: 6px;
`,f=(0,c.default)(m.Text).attrs({size:16,color:"#777777"})`
  margin-top: 7px;
`,x=(0,c.default)(u.ButtonGroup)`
  margin-top: 20px;
`,y=e(o).memo((t=>{const{enableCTABar:n,mint:a,symbol:i,balance:c,dollarValue:d,fungibleTokenType:m,showDollarValue:y,sendButtonText:k,receiveButtonText:v,swapButtonText:E,chainAddress:w,isReadOnlyAccount:S,handleShowSendModal:A,handleShowDepositFungibleModal:T,handleSwapClick:M,isSplNonTransferable:C}=t,D=a?(0,l.formatAddressShort)(a):void 0,B=`${(0,s.formatTokenAmount)(c)} ${null!=i?i:D}`,F=m!==r.FungibleTokenType.BRC20||!(0,h.isFeatureEnabled)("kill-brc20-sends"),I=p.hooks.useCanSendFungible({balance:c,fungibleTokenType:m,chainAddress:w,isSendEnabledForTokenType:F,isSplNonTransferable:C}),N=p.hooks.useCanSwapWithNetworkID({networkID:null==w?void 0:w.networkID}),L=!S&&!n;return e(o).createElement(b,null,e(o).createElement(g.ShrinkingText,{maxFontSize:38},B),y&&e(o).createElement(f,null,d?(0,s.formatDollarAmount)(d):"–"),L&&e(o).createElement(x,{buttonStyle:u.ButtonPairStyle.Small,buttons:[{theme:"primary",text:v,onClick:T},I&&{theme:"primary",text:k,onClick:A},I&&N&&{theme:"primary",text:E,onClick:M}].filter(Boolean)}))}))})),n.register("7CjHJ",(function(a,i){t(a.exports,"FungibleDetailLoader",(function(){return b}));var l=n("lDSNw"),r=n("cZIbv"),o=n("laYjG"),s=n("44I6u"),c=n("6l2nq"),u=n("hjnIF");const d=[1,2],g=(0,r.default)(c.Row)`
  height: 35px;
`,m=(0,r.default)(s.Column).attrs({align:"center"})`
  background: #2a2a2a;
  padding: 16px 14px;
  border-radius: 6px;
  margin-bottom: 24px;
`,p=r.default.div`
  width: 44px;
  height: 44px;
  margin-right: 10px;
`,h=(0,r.default)(u.SkeletonLoader).attrs({height:"8px",backgroundColor:"#484848",borderRadius:"8px"})``,b=e(l).memo((t=>e(l).createElement(e(l).Fragment,null,e(l).createElement(g,{justify:"center"},e(l).createElement(h,{width:"120px",height:"10px",margin:"0 0 7px 0"})),e(l).createElement(m,null,e(l).createElement(u.SkeletonLoader,{width:"100%",height:"70px",padding:"15px 0 30px 0"},e(l).createElement(s.Column,null,e(l).createElement(c.Row,{justify:"center",margin:"0 auto"},e(l).createElement(h,{width:"120px",height:"10px",margin:"0 0 7px 0"})),e(l).createElement(c.Row,{justify:"center",margin:"0 auto"},e(l).createElement(h,{width:"60px",height:"8px"})))),e(l).createElement(o.ButtonPair,{primaryText:t.sendText,primaryDisabled:!0,primaryTheme:"default",secondaryText:t.depositText,secondaryDisabled:!0,secondaryTheme:"default",buttonPairStyle:o.ButtonPairStyle.Small})),d.map((t=>e(l).createElement(u.SkeletonLoader,{key:`fungible-detail-row-loader-${t}`,align:"center",width:"100%",height:"74px",backgroundColor:"#2D2D2D",borderRadius:"8px",margin:"0 0 10px 0",padding:"10px"},e(l).createElement(p,null,e(l).createElement(u.SkeletonLoader,{width:"44px",height:"44px",backgroundColor:"#434343",borderRadius:"50%"})),e(l).createElement(s.Column,null,e(l).createElement(c.Row,{margin:"0 0 10px",justify:"space-between"},e(l).createElement(h,{width:"120px"}),e(l).createElement(h,{width:"60px"})),e(l).createElement(c.Row,{justify:"space-between"},e(l).createElement(h,{width:"75px"}),e(l).createElement(h,{width:"35px"})))))))))})),n.register("jBYwZ",(function(a,i){t(a.exports,"FungibleSummary",(function(){return g}));var l=n("lMzyG"),r=n("lDSNw"),o=n("cZIbv"),s=n("ks67t"),c=n("kn91D");const u=o.default.div`
  margin: 24px auto 0 auto;
  width: 100%;
`,d=(0,o.default)(c.Text).attrs({size:16,weight:500,color:"#777777",textAlign:"left",margin:"0 auto 16px 0",noWrap:!0})``,g=({name:t,items:n})=>{const{t:a}=(0,l.useTranslation)();return e(r).createElement(u,null,e(r).createElement(d,null,a("assetDetailAboutLabel",{fungibleName:t})),e(r).createElement(s.Summary,{rows:n}))}})),n.register("2pb0B",(function(a,i){t(a.exports,"FungibleSummaryCard",(function(){return b}));var l=n("belzv"),r=n("lDSNw"),o=n("gmVmN"),s=n("cZIbv"),c=n("6EObQ");const u=s.default.div`
  display: flex;
  align-items: center;
  margin: 16px 0;
`,d=s.default.div`
  display: flex;
  flex-direction: column;
`,g=s.default.div`
  overflow: hidden;
  word-break: break-word;
  text-overflow: ellipsis;
  word-break: break-all;
  font-size: 22px;
  font-weight: 600;
  line-height: 28px;
`,m=s.default.div`
  font-size: 15px;
  line-height: 20px;
  text-align: right;
  color: ${e=>e.positive?"#21E56F;":"#EB3742;"};
`,p=s.default.div`
  display: flex;
  overflow: hidden;
  word-break: break-word;
  text-overflow: ellipsis;
  word-break: break-all;
  color: #777777;
  font-size: 15px;
  line-height: 20px;
  text-align: ${e=>{var t;return null!==(t=e.textAlign)&&void 0!==t?t:"left"}};
`,h=s.default.figure`
  margin-right: 12px;
`,b=({logoUri:t,symbol:n,tokenAddress:a,chain:i,price:s,priceChange24h:b,name:f,type:x})=>{if(i.id===l.BitcoinNetworkID.Mainnet||i.id===l.BitcoinNetworkID.Testnet)return null;const y="number"==typeof b?b:e(r).createElement(e(r).Fragment,null,"—");return e(r).createElement(u,null,e(r).createElement(h,null,e(r).createElement(c.EcosystemImage,{image:{type:"fungible",src:t,fallback:n||a},tokenType:x,chainMeta:i})),e(r).createElement(d,null,e(r).createElement(g,null,f," "),e(r).createElement(p,null,n," • ",(0,o.formatDollarAmount)(s||0)," ","number"==typeof y&&0!==y?e(r).createElement(m,{positive:y>0},(0,o.formatNumber)(y,{includePlusPrefix:!0,suffix:"%"})):e(r).createElement(e(r).Fragment,null,(0,o.formatNumber)(0,{includePlusPrefix:!0,suffix:"%"})))))}})),n.register("1HSLJ",(function(a,i){t(a.exports,"StartEarningSol",(function(){return A}));var l=n("lMzyG"),r=n("gd9Oy"),o=n("4raQz"),s=n("4y59b"),c=n("lDSNw"),u=n("cZIbv"),d=n("miiws"),g=n("aanFI"),m=n("bkZ83"),p=n("02iAW"),h=n("4tc9b"),b=n("kn91D"),f=n("6ha3o"),x=n("aXzxc"),y=n("gMNJN"),k=n("1di4e");const v=(0,u.default)(h.TokenRowBody)`
  display: grid;
  grid-template-columns: 44px auto;
  column-gap: 10px;
  margin-bottom: 0;
`,E=u.default.div`
  overflow: hidden;
`,w=u.default.div`
  display: grid;
  grid-template-columns: 1fr;
`,S=u.default.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
`,A=()=>{var t;const{t:n}=(0,l.useTranslation)(),{pushDetailView:a}=(0,f.useDetailViews)(),{showValidatorListModal:i,hideValidatorListModal:u}=(0,x.useLegacyModals)(),{data:h}=y.hooks.useSelectedChainAddress(r.AddressType.Solana),A=null!==(t=null==h?void 0:h.address)&&void 0!==t?t:"",T=(0,c.useMemo)((()=>(0,o.createConnectionBySolanaNetworkID)(null==h?void 0:h.networkID)),[null==h?void 0:h.networkID]),M=y.hooks.useStakeAccounts(T,A),{isFetching:C,isError:D}=M,{totalStake:B,totalRewards:F,numAccounts:I}=(0,c.useMemo)((()=>{var e;const t=null!==(e=M.data)&&void 0!==e?e:[];return{totalStake:t.reduce(((e,t)=>e+t.lamports),0),totalRewards:t.reduce(((e,t)=>{var n;return e+(null!==(n=t.inflationReward)&&void 0!==n?n:0)}),0),numAccounts:t.length}}),[M.data]);return e(c).createElement(v,{role:"button",isDisabled:C,onClick:()=>{D?M.refetch():C||(I>0?a(e(c).createElement(k.StakeAccountListPage,null)):i({onClose:u}))}},C?e(c).createElement(d.Circle,{diameter:44,color:(0,s.hexToRGB)("#AB9FF2",.2)},e(c).createElement(p.Spinner,{diameter:28})):D?e(c).createElement(d.Circle,{diameter:44,color:(0,s.hexToRGB)("#EB3742",.1)},e(c).createElement(g.IconFailure,null)):e(c).createElement(d.Circle,{diameter:44,color:"#3F3D29"},e(c).createElement(g.IconStar,null)),e(c).createElement(E,null,C?e(c).createElement(w,null,e(c).createElement(b.Text,{size:16,weight:600,lineHeight:19,textAlign:"left"},n("startEarningSolLoading")),e(c).createElement(b.Text,{color:"#777777",size:14,lineHeight:17,textAlign:"left",noWrap:!0},n("startEarningSolSearching"))):D?e(c).createElement(w,null,e(c).createElement(b.Text,{size:16,weight:600,lineHeight:19,textAlign:"left"},n("startEarningSolErrorTroubleLoading")),e(c).createElement(b.Text,{color:"#777777",size:14,lineHeight:17,textAlign:"left",noWrap:!0},n("startEarningSolErrorClosePhantom"))):I?e(c).createElement(e(c).Fragment,null,e(c).createElement(S,null,e(c).createElement(b.Text,{size:16,weight:600,lineHeight:19,textAlign:"left"},n("startEarningSolYourStake")),e(c).createElement(b.Text,{size:14,weight:400,lineHeight:17,textAlign:"right",noWrap:!0},e(c).createElement(m.SolBalance,null,B))),e(c).createElement(S,null,e(c).createElement(b.Text,{color:"#777777",size:14,lineHeight:19,textAlign:"left",noWrap:!0},I," ",1===I?"account":"accounts"),e(c).createElement(b.Text,{size:14,color:""+(F>0?"#21E56F":"#777777"),lineHeight:17,textAlign:"right",noWrap:!0},F>0?e(c).createElement(e(c).Fragment,null,"+",e(c).createElement(m.SolBalance,null,F)):"–"))):e(c).createElement(w,null,e(c).createElement(b.Text,{size:16,weight:600,lineHeight:19,textAlign:"left"},n("startEarningSolPrimaryText")),e(c).createElement(b.Text,{color:"#777777",size:14,lineHeight:17,textAlign:"left",noWrap:!0},n("startEarningSolStakeTokens")))))}})),n.register("1di4e",(function(a,i){t(a.exports,"StakeAccountListPage",(function(){return h}));var l=n("belzv"),r=n("lMzyG"),o=n("4raQz"),s=n("lDSNw"),c=n("jQk2k"),u=n("aanFI"),d=n("ll4uk"),g=n("aXzxc"),m=n("7sEvl"),p=n("gMNJN");const h=()=>{const{t:t}=(0,r.useTranslation)(),{showValidatorListModal:n,hideValidatorListModal:a}=(0,g.useLegacyModals)(),{data:i}=p.hooks.useSelectedMultiChainAccount(),{solanaPublicKey:h,connection:b}=(0,s.useMemo)((()=>{var e,t;const n=(null!==(e=null==i?void 0:i.addresses)&&void 0!==e?e:[]).find((e=>l.Chains.isSolanaNetworkID(e.networkID))),a=null!==(t=null==n?void 0:n.address)&&void 0!==t?t:"",r=null==n?void 0:n.networkID;return{solanaPublicKey:a,connection:(0,o.createConnection)((0,o.getClusterBySolanaChainId)(r))}}),[i]),f=p.hooks.useStakeAccounts(b,h);return e(s).createElement(e(s).Fragment,null,e(s).createElement(c.PageHeader,{onIconClick:()=>n({onClose:a}),icon:e(s).createElement(u.IconPlus,null)},t("stakeAccountListViewPrimaryText")),e(s).createElement(d.FullHeightLoadingContent,{isLoading:!f.isFetched},e(s).createElement(m.StakeAccountList,null)))}})),n.register("7sEvl",(function(a,i){t(a.exports,"StakeAccountList",(function(){return v}));var l=n("6Tvfa"),r=n("belzv"),o=n("lMzyG"),s=n("6oMdZ"),c=n("4raQz"),u=n("lDSNw"),d=n("cZIbv"),g=n("bpx2y"),m=n("ll4uk"),p=n("bkZ83"),h=n("jAo12"),b=n("4tc9b"),f=n("kn91D"),x=n("aXzxc"),y=n("gMNJN"),k=n("h5kyv");const v=()=>{var t;const{t:n}=(0,o.useTranslation)();(0,u.useEffect)((()=>(k.analytics.capture("showStakeAccountList"),()=>{k.analytics.capture("hideStakeAccountList")})),[]);const{data:a}=y.hooks.useSelectedMultiChainAccount(),{solanaPublicKey:i,connection:l}=(0,u.useMemo)((()=>{var e,t;const n=(null!==(e=null==a?void 0:a.addresses)&&void 0!==e?e:[]).find((e=>r.Chains.isSolanaNetworkID(e.networkID))),i=null!==(t=null==n?void 0:n.address)&&void 0!==t?t:"",l=null==n?void 0:n.networkID;return{solanaChainAddress:n,solanaPublicKey:i,connection:(0,c.createConnection)((0,c.getClusterBySolanaChainId)(l))}}),[a]),s=y.hooks.useStakeAccounts(l,i),d=null!==(t=s.data)&&void 0!==t?t:[];return e(u).createElement(m.FullHeightLoadingContent,{isLoading:!s.isFetched},s.isError?e(u).createElement(g.ErrorView,{title:n("errorAndOfflineSomethingWentWrong"),description:n("stakeAccountListErrorFetching"),refetch:()=>{s.isFetching||s.refetch()}}):e(u).createElement(E,{data:d,connection:l}),e(u).createElement("br",null))},E=t=>{const{t:n}=(0,o.useTranslation)(),a=F(t.connection),i=t.data.slice().sort(((e,t)=>e.lamports>t.lamports?-1:1)),l=i.filter((e=>e.type===s.StakeAccountType.Delegated)),r=i.filter((e=>e.type===s.StakeAccountType.Initialized));return l.length||r.length?e(u).createElement(e(u).Fragment,null,l.length>0&&e(u).createElement(e(u).Fragment,null,l.map((n=>{var i,l,r;const{stake:o,voter:s}=n.info.stake.delegation,c=a.get(s),d=null===(i=null==c?void 0:c.info)||void 0===i?void 0:i.name,g=null===(l=null==c?void 0:c.info)||void 0===l?void 0:l.keybaseUsername,m=null===(r=null==c?void 0:c.info)||void 0===r?void 0:r.iconUrl;return e(u).createElement(D,{key:n.pubkey,pubkey:n.pubkey,balance:n.lamports,delegatedStake:Number(o),inflationReward:n.inflationReward,voteAccountPubkey:s,name:d,keybaseUsername:g,iconUrl:m,connection:t.connection})}))),r.length>0&&e(u).createElement(e(u).Fragment,null,r.map((n=>e(u).createElement(B,{key:n.pubkey,pubkey:n.pubkey,balance:n.lamports,inflationReward:n.inflationReward,connection:t.connection}))))):e(u).createElement(w,null,e(u).createElement(f.Text,{size:16,color:"#666666"},n("stakeAccountListNoStakingAccounts")))},w=d.default.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: calc(100% - 42px);
`,S=(0,d.default)(b.TokenRowBody)`
  display: grid;
  grid-template-columns: 44px auto;
  column-gap: 10px;
`,A=(0,d.default)(h.TokenImage).attrs({width:44})``,T=d.default.div`
  overflow: hidden;
`,M=d.default.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
`,C=(0,d.default)(f.Text)`
  color: ${e=>"active"===e.activationState?"#21E56F":"inactive"===e.activationState?"#EB3742":"activating"===e.activationState||"deactivating"===e.activationState?"#FFE920":"#777777"};
`,D=t=>{var n,a,i;const{t:r}=(0,o.useTranslation)(),{showStakeAccountDetailModal:s}=(0,x.useLegacyModals)(),{data:c}=y.hooks.useKeybaseUserAvatar(t.keybaseUsername),d=null!==(a=null!==(n=t.name)&&void 0!==n?n:t.keybaseUsername)&&void 0!==a?a:(0,l.formatHashMedium)(t.voteAccountPubkey),g=y.hooks.useStakeActivationData(t.connection,t.pubkey).data,m=t.inflationReward&&t.inflationReward>0;return e(u).createElement(S,{onClick:()=>{s({stakeAccountPubkey:t.pubkey})}},e(u).createElement(A,{iconUrl:null!==(i=t.iconUrl)&&void 0!==i?i:c}),e(u).createElement(T,null,e(u).createElement(M,null,e(u).createElement(f.Text,{size:16,weight:600,lineHeight:19,textAlign:"left",noWrap:!0},d),e(u).createElement(f.Text,{size:14,weight:400,lineHeight:19,textAlign:"right",noWrap:!0},e(u).createElement(p.SolBalance,null,t.delegatedStake))),e(u).createElement(M,null,e(u).createElement(C,{size:14,activationState:null==g?void 0:g.state,lineHeight:19,textAlign:"left",textTransform:"capitalize",noWrap:!0},"activating"===(null==g?void 0:g.state)?r("stakeAccountListActivationActivating"):"","active"===(null==g?void 0:g.state)?r("stakeAccountListActivationActive"):"","inactive"===(null==g?void 0:g.state)?r("stakeAccountListActivationInactive"):"","deactivating"===(null==g?void 0:g.state)?r("stakeAccountListActivationDeactivating"):""),e(u).createElement(f.Text,{size:14,color:""+(m?"#21E56F":"#777777"),lineHeight:19,textAlign:"right",noWrap:!0},m?e(u).createElement(e(u).Fragment,null,"+",e(u).createElement(p.SolBalance,null,t.inflationReward)):"-"))))},B=t=>{const{t:n}=(0,o.useTranslation)(),{showStakeAccountDetailModal:a}=(0,x.useLegacyModals)(),i=y.hooks.useStakeActivationData(t.connection,t.pubkey).data,l=t.inflationReward&&t.inflationReward>0;return e(u).createElement(S,{onClick:()=>a({stakeAccountPubkey:t.pubkey})},e(u).createElement(A,null),e(u).createElement(T,null,e(u).createElement(M,null,e(u).createElement(f.Text,{size:16,weight:600,lineHeight:19,textAlign:"left",noWrap:!0},t.pubkey),e(u).createElement(f.Text,{size:14,weight:400,lineHeight:19,textAlign:"right",noWrap:!0},e(u).createElement(p.SolBalance,null,t.balance))),e(u).createElement(M,null,e(u).createElement(C,{size:14,activationState:null==i?void 0:i.state,lineHeight:19,textAlign:"left",textTransform:"capitalize",noWrap:!0},"activating"===(null==i?void 0:i.state)?n("stakeAccountListActivationActivating"):"","active"===(null==i?void 0:i.state)?n("stakeAccountListActivationActive"):"","inactive"===(null==i?void 0:i.state)?n("stakeAccountListActivationInactive"):"","deactivating"===(null==i?void 0:i.state)?n("stakeAccountListActivationDeactivating"):""),e(u).createElement(f.Text,{size:14,color:""+(l?"#21E56F":"#777777"),lineHeight:19,textAlign:"right",noWrap:!0},l&&"+",e(u).createElement(p.SolBalance,null,t.inflationReward)))))},F=e=>{var t;const n=y.hooks.useValidators(e),a=null!==(t=n.results)&&void 0!==t?t:[],i=(0,u.useRef)(a);i.current=a;return(0,u.useMemo)((()=>new Map(i.current.map((e=>[e.voteAccountPubkey,e])))),[n.dataUpdatedAt,i])}})),n.register("3OE1H",(function(a,i){t(a.exports,"ButtonUnwrapFungible",(function(){return h}));var l=n("lMzyG"),r=n("lDSNw"),o=n("cZIbv"),s=n("6EObQ"),c=n("4tc9b"),u=n("kn91D"),d=n("2LZGp");const g=(0,o.default)(c.TokenRowBody)`
  display: grid;
  grid-template-columns: 44px auto;
  column-gap: 10px;
  margin-bottom: 0;
`,m=o.default.div`
  display: grid;
  grid-template-columns: 1fr;
`,p=(0,o.default)(u.Text)`
  margin-top: 5px;
`,h=({fungible:t})=>{const{symbol:n,name:a,logoUri:i,chain:o}=t.data,{t:c}=(0,l.useTranslation)(),{handleShowModalVisibility:h}=(0,d.useModals)(),b=(0,r.useCallback)((()=>{h("approveUnwrapFungible",{fungible:t})}),[t,h]);return e(r).createElement(g,{onClick:b},e(r).createElement(s.EcosystemImage,{image:{type:"icon",preset:"swap"},size:48,badge:{src:null!=i?i:""}}),e(r).createElement(m,null,e(r).createElement(u.Text,{size:16,weight:600,lineHeight:19,textAlign:"left"},c("unwrapFungibleTitle",{tokenSymbol:n})),e(r).createElement(p,{color:"#777777",size:14,lineHeight:17,textAlign:"left"},c("unwrapFungibleDescription",{fromToken:a,toToken:o.symbol}))))}})),n.register("lKTPx",(function(e,a){t(e.exports,"useNavigateToSwapper",(function(){return u}));var i=n("belzv"),l=n("gYh0e"),r=n("lDSNw"),o=n("lz7nT"),s=n("8182A");const c=e=>{const t=(0,l.getFungibleCaip19FromFungible)(e);return(0,i.encodeCaip19)(t)},u=()=>{const e=(0,o.useNavigate)();return(0,r.useCallback)((({sellFungible:t,buyFungible:n,sellAmount:a})=>{const i=new URLSearchParams;t&&i.append("sellFungible",c(t)),n&&i.append("buyFungible",c(n)),a&&i.append("sellAmount",a),e(`${s.Path.Swap}?${i.toString()}`)}),[e])}}));
//# sourceMappingURL=HomeTabPage.0d4c362a.js.map
define=__define;})(window.define);