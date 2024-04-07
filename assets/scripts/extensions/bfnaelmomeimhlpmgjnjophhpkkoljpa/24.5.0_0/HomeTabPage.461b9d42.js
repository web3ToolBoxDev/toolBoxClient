(function(define){var __define;"function"==typeof define&&define.amd&&(__define=define,define=null);
!function(){function e(e){return e&&e.__esModule?e.default:e}function t(e,t,n,a){Object.defineProperty(e,t,{get:n,set:a,enumerable:!0,configurable:!0})}var n=("undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{}).parcelRequire1d24;n.register("izxKn",(function(a,i){var l;l=a.exports,Object.defineProperty(l,"__esModule",{value:!0,configurable:!0}),t(a.exports,"default",(function(){return V}),(function(e){return V=e}));var o=n("4xbAj"),r=n("iOvk1"),s=n("3ljHn"),c=n("5slFC"),u=n("43063"),d=n("RVqnc"),g=n("7dHjq"),m=n("29o0l"),p=n("6RB6n"),f=n("gkfw3"),h=n("8cn6w"),b=n("aWXnn"),k=n("lq7YC"),x=n("kckw8"),y=n("lsCEZ"),v=n("gGtJv"),w=n("i1NO2"),E=n("brWcm"),S=n("dKFQQ"),A=n("dRJ3q"),T=n("bJlxR"),C=n("d1JH7"),M=n("gX5Te"),F=n("feAoQ"),B=n("kdiZd"),D=n("twk6W"),I=n("lJodL"),L=function(e,t,n,a){return new(n||(n=Promise))((function(i,l){function o(e){try{s(a.next(e))}catch(e){l(e)}}function r(e){try{s(a.throw(e))}catch(e){l(e)}}function s(e){var t;e.done?i(e.value):(t=e.value,t instanceof n?t:new n((function(e){e(t)}))).then(o,r)}s((a=a.apply(e,t||[])).next())}))};const P=e(m).memo((({visibilityOverrides:t,fungibles:n,isMainnet:a,onMouseEnter:i})=>{var l;const{t:o}=(0,u.useTranslation)(),{pushDetailView:s}=(0,w.useDetailViews)(),c=(0,m.useRef)(document.getElementById("tab-content"));(0,m.useEffect)((()=>{const e=document.getElementById("tab-content");e&&(c.current=e)}),[]);const d=(0,m.useCallback)((({networkID:t,chainName:n,fungibleKey:a,name:i,symbol:l,tokenAddress:o,type:c,walletAddress:u})=>{D.analytics.capture("assetDetailClick",{asset:{type:"fungible",chain:n,isNativeOfType:n,address:o},data:{networkId:t,chainId:r.Chains.getChainID(t)}}),s(e(m).createElement(I.FungibleDetailPage,{networkID:t,chainName:n,name:i,symbol:l,fungibleKey:a,tokenAddress:o,type:c,walletAddress:u}))}),[s]),g=(0,m.useCallback)((({key:l,index:r,style:s})=>{const c=Math.min(r+1,n.length),u=[];for(let l=r;l<c;l++){const s=n[l],c=s.type,{chain:g,name:p,symbol:f,key:h,tokenAddress:b,walletAddress:k}=s.data,x=null!=p?p:o("assetDetailUnknownToken");u.push(e(m).createElement(S.FungibleTokenRow,Object.assign({},(0,S.fungibleToProps)(s,t),{key:`${h}-${r}`,onClick:()=>d({networkID:g.id,chainName:g.name,fungibleKey:h,name:x,symbol:f,tokenAddress:b,type:c,walletAddress:k}),onMouseEnter:i,showBalance:!0,showCurrencyValues:a})))}return e(m).createElement("div",{key:l,style:s},u)}),[n,a,d,i,o,t]);return e(m).createElement(p.WindowScroller,{scrollElement:null!==(l=c.current)&&void 0!==l?l:void 0},(({height:t=0,isScrolling:a,registerChild:i,scrollTop:l})=>e(m).createElement(p.AutoSizer,{disableHeight:!0,style:{width:"100%"}},(({width:o})=>e(m).createElement("div",{ref:i},e(m).createElement(p.List,{autoHeight:!0,width:o,height:t,scrollTop:l,isScrolling:a,rowCount:n.length,rowHeight:S.FUNGIBLE_TOKEN_ROW_HEIGHT+10,rowRenderer:g}))))))})),N=(0,d.toMilliseconds)({seconds:5}),R=(0,d.toMilliseconds)({seconds:10}),H=f.default.div`
  margin-top: 32px;
  margin-bottom: 32px;
  width: 100%;
`;var V=()=>{const{data:t,isHidingAllFungibles:n,isLoading:a,isErrorTokens:i,isReadOnlyAccount:l,refetch:r,shouldShowPartialError:d,partialErrorMessage:p}=(()=>{const e=(0,g.useQueryClient)(),{showDepositListModal:t,showFungibleVisibilityModal:n,showBuyFungibleSelectionModal:a,showSendFungibleSelectionModal:i}=(0,E.useLegacyModals)(),{handleShowModalVisibility:l,handleHideModalVisibility:r}=(0,F.useModals)(),{t:d}=(0,u.useTranslation)(),p=(0,m.useMemo)((()=>({manageTokenList:d("homeManageTokenList"),receive:d("commandReceive"),send:d("commandSend"),buy:d("commandBuy"),errorTitle:d("homeErrorTitle"),errorDescription:d("homeErrorDescription"),errorButton:d("homeErrorButtonText")})),[d]),{data:[f]}=(0,s.useFeatureFlags)(["enable-cta-bar"]),{data:h}=M.hooks.useSelectedMultiChainAccount(),{ctaActions:b,shouldShowPartialError:k,partialErrorMessage:x}=M.hooks.useHomeViewState({onTappingBuy:a,onTappingReceive:t,onTappingSend:i,account:h}),{accountBalance:y,accountId:v}=(0,m.useMemo)((()=>{var e,t;return{accountBalance:null===(e=null==h?void 0:h.balance)||void 0===e?void 0:e.value,accountId:null!==(t=null==h?void 0:h.identifier)&&void 0!==t?t:""}}),[h]),w=null==h?void 0:h.isReadOnly,S=!M.hooks.useIsTestnetMode(),T=(0,c.useFungiblesStore)((e=>e.resetSendSlice));(0,m.useEffect)((function(){v&&T()}),[v,T]);const{fungibles:C,visibilityOverrides:D,portfolio:I,isHidingAllFungibles:P,isLoadingVisibilityOverrides:H,isLoadingTokens:V,isLoadingPrices:W,isErrorTokens:O,refetch:z}=M.hooks.useFungibles({useTokenQueryOptions:{staleTime:N,refetchInterval:R}}),{mutate:j}=M.hooks.useSetMultiChainAccountBalance();(0,o.useSetAccountBalanceEffect)({accountBalance:y,accountId:v,value:I.value,setAccountBalance:j});const $=M.hooks.useSelectedNetworks();(0,B.useWalletBalanceAnalytics)(C,$,v);const U=(0,m.useCallback)((()=>L(void 0,void 0,void 0,(function*(){return yield(0,c.prefetchSPLTokenMap)(e)}))),[e]),q=(0,m.useMemo)((()=>C.filter((e=>(0,c.isVisibleMint)(D,{key:e.data.key,spamStatus:e.data.spamStatus})))),[C,D]),X=H||V||W,{buttonDisabled:K}=(0,A.getButtonState)({isLoading:X,isEnabled:C.length>0||P,isErrorTokens:O});return{data:(0,m.useMemo)((()=>({fungibles:q,earnings:I.earnings,value:I.value,isMainnet:S,translations:p,visibilityOverrides:D,enableCTABar:f,ctaActions:b,buttonDisabled:K,showDepositListModal:t,showBuyFungibleSelectionModal:a,showSendFungibleSelectionModal:i,showFungibleVisibilityModal:n,handlePrefetchSPLTokenMap:U,handleShowModalVisibility:l,handleHideModalVisibility:r})),[D,q,I,n,p,S,a,t,i,U,l,r,f,b,K]),isHidingAllFungibles:P,isLoading:H||V||W,isErrorTokens:O,isReadOnlyAccount:w,refetch:z,shouldShowPartialError:k,partialErrorMessage:x}})(),{fungibles:f,translations:w,isMainnet:S,earnings:D,value:I,visibilityOverrides:V,enableCTABar:W,ctaActions:O,buttonDisabled:z,showDepositListModal:j,showBuyFungibleSelectionModal:$,showSendFungibleSelectionModal:U,handlePrefetchSPLTokenMap:q,handleShowModalVisibility:X}=t,{manageTokenList:K,receive:_,send:Q,buy:J,errorTitle:G,errorDescription:Y,errorButton:Z}=w,ee=f.length>0;return e(m).createElement(b.Column,{align:"center"},e(m).createElement(A.Header,{enableCTABar:W,earnings:D,value:I,buyButtonText:J,receiveButtonText:_,hasFungibles:ee,isErrorTokens:i,isLoading:a,isHidingAllFungibles:n,isReadOnlyAccount:l,sendButtonText:Q,showDollarValues:S,prefetchSPLTokenMap:q,showSendFungibleSelectionModal:U,showDepositListModal:j,showBuyFungibleSelectionModal:$,shouldShowPartialError:d,partialErrorMessage:p}),W&&!l&&e(m).createElement(H,null,e(m).createElement(k.CTABar,{disabled:z,actions:O,uiContextName:"home"})),e(m).createElement(h.ActionBannersVisibility,{isReadOnlyAccount:l}),e(m).createElement(y.HelloBitcoinInterstitialVisibility,null),e(m).createElement(x.ForceUpgradeInterstitialVisibility,null),a?[1,2,3].map((t=>e(m).createElement(v.RowSkeletonLoader,{key:`fungible-token-row-loader-${t}`}))):ee?e(m).createElement(P,{visibilityOverrides:V,fungibles:f,isMainnet:S,onMouseEnter:q}):n?null:e(m).createElement(T.HomeError,{title:G,description:Y,buttonText:Z,refetch:r}),a?null:ee||n?e(m).createElement(C.ManageTokenListButton,{buttonText:K,onClick:()=>X("fungibleVisibility")}):null)}})),n.register("8cn6w",(function(a,i){t(a.exports,"ActionBannersVisibility",(function(){return S}));var l=n("3ljHn"),o=n("ibwoK"),r=n("29o0l"),s=n("9w5Wb"),c=n("gkfw3"),u=n("gX5Te"),d=n("4RT7E"),g=n("gcdBN"),m=n("j81qC"),p=n("6I6Pd"),f=n("dd8D3"),h=n("5bn5I");const b=c.default.div`
  height: 0;
  transition: height 0.2s ease-in-out;
  width: 100%;
  ${e=>e.animate?"height: "+(e.shouldCollapse?"100px":"120px"):""}
`,k=c.default.div`
  transition: transform 0.5s ease;
  width: 100%;
`,x=(0,c.default)(p.IconBackground)``,y=c.default.div`
  visibility: ${e=>e.isVisible?"visible":"hidden"};
`,v=c.default.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
`,w=e(r).memo((({banners:t,currentIndex:n,hasNextBanner:a,hasPrevBanner:i,onNextBannerClick:l,onPrevBannerClick:o})=>{const s=t.length<=1;return e(r).createElement(b,{animate:t.length>0,shouldCollapse:s},e(r).createElement(k,null,e(r).createElement(h.ActionBannerList,{banners:t,currentIndex:n}),!s&&e(r).createElement(v,null,e(r).createElement(y,{isVisible:i},e(r).createElement(x,{onClick:o},e(r).createElement(m.IconArrowLeftShort,null))),e(r).createElement(f.default,{numOfItems:t.length,currentIndex:n,maxVisible:5}),e(r).createElement(y,{isVisible:a},e(r).createElement(x,{onClick:l},e(r).createElement(m.IconArrowRightShort,null))))))})),E=()=>{const t=(()=>{const{data:t={banners:[]}}=u.hooks.useActionBanners({platform:"extension",appVersion:(0,g.getManifestVersion)()}),{data:n}=u.hooks.useSelectedMultiChainAccountIdentifier(),{banners:a}=t,i=e(s)(n),[l,c]=(0,r.useState)(0),m=(0,r.useCallback)((()=>{c((e=>e+1))}),[]),p=(0,r.useCallback)((()=>{c((e=>e-1))}),[]);return(0,r.useEffect)((()=>{if(a.length&&n)if(i!==n)c(0);else if(l>=a.length)c(a.length-1);else{const e=a[l],t=(0,o.generateActionBannerBaseAnalyticsPayload)(e);d.actionBannerAnalytics.onBannerSeen(t)}}),[l,a,n,i]),(0,r.useMemo)((()=>({banners:a,currentIndex:l,hasNextBanner:l<a.length-1,hasPrevBanner:l>0,onNextBannerClick:m,onPrevBannerClick:p})),[a,l,p,m])})();return e(r).createElement(w,Object.assign({},t))},S=({isReadOnlyAccount:t})=>{const{data:[n]}=(0,l.useFeatureFlags)(["kill-action-banners"]);return t||n?null:e(r).createElement(E,null)}})),n.register("4RT7E",(function(e,a){t(e.exports,"actionBannerAnalytics",(function(){return o}));var i=n("ibwoK"),l=n("twk6W");const o=new(0,i.ActionBannerAnalytics)(l.analytics)})),n.register("dd8D3",(function(a,i){t(a.exports,"default",(function(){return d}));var l=n("29o0l"),o=n("gkfw3");const r=o.default.div`
  display: flex;
  justify-content: ${e=>e.shouldCenter?"center":"flex-start"};
  align-items: center;
  position: relative;
  overflow: hidden;
  width: ${e=>9*(e.maxVisible-1)+18}px;
`,s=o.default.div`
  align-items: center;
  display: flex;
  ${e=>e.shouldShift&&o.css`
      transform: translateX(calc(-${9}px * ${e.shiftAmount}));
      transition: transform 0.3s ease-in-out;
    `}
`,c=o.default.div`
  align-items: center;
  background-color: #999999;
  border-radius: 95px;
  display: flex;
  height: ${5}px;
  justify-content: center;
  margin: 0 ${2}px;
  min-width: ${5}px;
  transition: all 0.3s ease-in-out;
  ${e=>e.isActive&&o.css`
      min-width: ${14}px;
    `}
  ${e=>e.isSmall&&o.css`
      min-width: 3px;
      margin: 0 ${2}px;
      height: 3px;
    `}
`,u=o.default.div`
  width: ${14}px;
  height: ${5}px;
  border-radius: 95px;
  position: absolute;
  margin: 0 ${2}px;
  background-color: #ab9ff2;
  transition: transform 0.3s ease-in-out;
  ${e=>e.position&&o.css`
      transform: translateX(${9*e.position}px);
    `}
`;var d=({numOfItems:t,currentIndex:n,maxVisible:a=5})=>{const i=t>a&&n>a-3,o=i?n-(a-3):0;return e(l).createElement(r,{shouldCenter:a>t,maxVisible:a},e(l).createElement(s,{shouldShift:i,shiftAmount:o},Array.from({length:t}).map(((t,a)=>{const o=(a===n-2||a===n+2)&&i;return e(l).createElement(c,{key:`pagination-dot-${a}`,isActive:n===a,isSmall:o})})),e(l).createElement(u,{position:n})))}})),n.register("5bn5I",(function(a,i){t(a.exports,"ActionBannerList",(function(){return u}));var l=n("29o0l"),o=n("gkfw3"),r=n("clXr3");const s=o.default.ul`
  align-items: center;
  display: flex;
  margin-bottom: 8px;
  transition: transform 0.5s ease;
  transform: ${e=>`translateX(${-100*e.currentIndex}%)`};
`,c=o.default.li`
  align-items: center;
  display: flex;
  height: 74px;
  flex: 0 0 100%;
  padding: ${e=>e.isActive?"0":e.isNext||e.isPrevious?"0 6px":"0"};
`,u=({banners:t,currentIndex:n})=>e(l).createElement(s,{currentIndex:n},t.map(((t,a)=>e(l).createElement(c,{key:t.id,isActive:n===a,isNext:n+1===a,isPrevious:n-1===a},e(l).createElement(r.ActionBannerListItem,{banner:t,isActive:n===a})))))})),n.register("clXr3",(function(a,i){t(a.exports,"ActionBannerListItem",(function(){return E}));var l=n("43063"),o=n("ibwoK"),r=n("lz5BI"),s=n("29o0l"),c=n("gkfw3"),u=n("gX5Te"),d=n("43gjF"),g=n("feAoQ"),m=n("4RT7E"),p=n("hFkH3"),f=n("j81qC"),h=n("27SDj");const b=(0,c.default)(r.motion.button)`
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
`,k=(0,c.default)(r.motion.div)`
  align-items: center;
  display: flex;
`,x=c.default.img`
  margin-right: 12px;
  width: 44px;
`,y=(0,c.default)(h.Text).attrs({lineHeight:17,size:14})`
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
`,w=e(s).memo((({banner:t,isActive:n,onClickBanner:a,onCloseBanner:i})=>e(s).createElement(b,{layout:!0,onClick:a,isActive:n},e(s).createElement(k,{layout:!0},e(s).createElement(x,{src:t.imageUrl}),e(s).createElement(y,{weight:600},t.description),e(s).createElement(v,{onClick:i},e(s).createElement(f.IconClose,{fill:"#ffffff",width:8})))))),E=t=>{const n=(({banner:t,isActive:n})=>{const{t:a}=(0,l.useTranslation)(),i=(0,d.useDeepLink)(),{mutateAsync:r}=u.hooks.useDismissActionBanner(),{handleShowModalVisibility:c,handleHideModalVisibility:f}=(0,g.useModals)(),h=(0,s.useCallback)((n=>{const l=(0,o.generateActionBannerBaseAnalyticsPayload)(t);switch(m.actionBannerAnalytics.onBannerClick(l),t.bannerType){case o.ActionBannerType.DirectLink:{const{destinationType:e,url:a}=t;i(n,{destinationType:e,url:a});break}case o.ActionBannerType.Modal:{const{interstitial:l,destinationType:r,url:u}=t,{title:d,lineItems:g=[],imageUrl:h,primaryButtonText:b=a("commandContinue"),secondaryButtonText:k=a("commandDismiss")}=l,x=(0,o.generateActionBannerInterstitialAnalyticsPayload)(t),y=g.map((e=>({icon:e.imageUrl,subtitle:e.description,title:e.title})));c("interstitial",{bodyTitle:d,details:y,icon:h,onDismiss:()=>{m.actionBannerAnalytics.onInterstitialDismiss(x)},FooterComponent:()=>e(s).createElement(p.ButtonPair,{primaryText:b,secondaryText:k,onPrimaryClicked:()=>{i(n,{destinationType:r,url:u}),m.actionBannerAnalytics.onInterstitialPrimaryClick(x),f("interstitial")},onSecondaryClicked:()=>{m.actionBannerAnalytics.onInterstitialSecondaryClick(x),f("interstitial")}})}),m.actionBannerAnalytics.onInterstitialSeen(x);break}}}),[t,c,f,a,i]),b=(0,s.useCallback)((e=>{e.stopPropagation(),r({actionBannerId:t.id});const n=(0,o.generateActionBannerBaseAnalyticsPayload)(t);m.actionBannerAnalytics.onBannerDismiss(n)}),[t,r]);return(0,s.useMemo)((()=>({isActive:n,banner:t,onClickBanner:h,onCloseBanner:b})),[t,n,h,b])})(t);return e(s).createElement(w,Object.assign({},n))}})),n.register("43gjF",(function(a,i){t(a.exports,"useDeepLink",(function(){return m}));var l=n("ibwoK"),o=n("29o0l"),r=n("iQL9s"),s=n("brWcm"),c=n("jOE8F"),u=n("9aR5q"),d=n("gcdBN"),g=n("jcNNm");const m=()=>{const{showSettingsMenu:t}=(0,c.useSettingsMenu)(),{showBuyFungibleSelectionModal:n}=(0,s.useLegacyModals)(),a=(0,r.useNavigate)();return(0,o.useCallback)(((i,r)=>{const{destinationType:s,url:c}=r;switch(s){case l.DeepLinkDestination.ExternalLink:(0,d.openTabAsync)({url:c});break;case l.DeepLinkDestination.Buy:n();break;case l.DeepLinkDestination.Collectibles:a(u.Path.Collectibles);break;case l.DeepLinkDestination.Explore:a(u.Path.Explore);break;case l.DeepLinkDestination.Quests:a(u.Path.Explore,{state:{tab:"quests",date:Date.now()}});break;case l.DeepLinkDestination.Swapper:a(u.Path.Swap);break;case l.DeepLinkDestination.SettingsImportSeedPhrase:(0,d.openTabAsync)({url:"onboarding.html?append=true"});break;case l.DeepLinkDestination.ConnectHardwareWallet:(0,d.openTabAsync)({url:"connect_hardware.html"});break;default:{const n=(0,g.getSanityComponentMapping)(s);if(!n)return;t(i,e(o).createElement(n,null))}}}),[a,t,n])}})),n.register("jcNNm",(function(e,a){t(e.exports,"getSanityComponentMapping",(function(){return o}));var i=n("ibwoK"),l=n("3FC78");const o=e=>{if(e===i.DeepLinkDestination.SettingsSecurityAndPrivacy)return l.MultiChainSecurity}})),n.register("lq7YC",(function(a,i){t(a.exports,"CTABar",(function(){return h}));var l=n("9yJOd"),o=n("29o0l"),r=n("gkfw3"),s=n("feAoQ"),c=n("6UR7D"),u=n("h7kan");const d=r.default.div`
  display: grid;
  grid-gap: 8px;
  grid-template-columns: ${e=>`repeat(${e.buttonCount}, minmax(0, 1fr));`};
  width: 100%;
  height: 74px;
`,g=r.default.button`
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
`,m=r.default.div`
  height: 24px;
  overflow: hidden;
`,p=(0,r.default)(g)`
  background: #2a2a2a;
  * {
    color: ${e=>e.theme.grayLight};
  }
  &:hover:enabled {
    background: #333333;
  }
`,f=(0,r.default)(g)`
  background: #2a2a2a;
  * {
    color: ${e=>e.theme.grayLight};
  }
  &:hover:enabled {
    background: #333333;
  }
`;function h({actions:t,shortcuts:n,hostname:a,headerText:i,maxButtons:r=4,uiContextName:g,disabled:h=!1}){var b;const k=(0,o.useMemo)((()=>t.length>r?t.slice(r-1):[]),[t,r]),x=(0,o.useMemo)((()=>k.length>0?t.slice(0,r-1):t),[t,k,r]),y=t.length+(null!==(b=null==n?void 0:n.length)&&void 0!==b?b:0),{handleShowModalVisibility:v,handleHideModalVisibility:w}=(0,s.useModals)(),E=(0,o.useCallback)(((e,t)=>{c.fungibleAnalytics.ctaBarTrackPrimaryButtonsClick({uiContext:{name:g},position:t,type:e,maxButtons:r,primaryActions:x,moreActions:k})}),[r,k,x,g]);return e(o).createElement(d,{buttonCount:Math.min(t.length,r)},x.map((t=>{var n;return e(o).createElement(p,{disabled:h,key:t.type,type:"button",onClick:()=>{E(t.type,"primary"),t.onClick(t.type)}},e(o).createElement(m,null,e(o).createElement(u.CTAIcon,{color:h?"gray":"accentPrimary",type:t.type})),e(o).createElement("span",null,null!==(n=t.singleWordAltText)&&void 0!==n?n:t.text))})),k.length>0?e(o).createElement(f,{disabled:h,type:"button",onClick:()=>{c.fungibleAnalytics.ctaBarTrackMoreButtonClick({uiContext:{name:g},maxButtons:r,totalButtons:y}),v("callToActionSheet",{headerText:i,actions:k,shortcuts:n,hostname:a,onClose:()=>{w("callToActionSheet")},trackAction:e=>{E(e,"more")}})}},e(o).createElement(l.icons.MoreHorizontal,{size:24,color:"accentPrimary"}),e(o).createElement("span",null,"More")):null)}})),n.register("6UR7D",(function(e,a){t(e.exports,"fungibleAnalytics",(function(){return o}));var i=n("5slFC"),l=n("twk6W");const o=new(0,i.FungibleAnalytics)(l.analytics)})),n.register("dRJ3q",(function(a,i){t(a.exports,"Header",(function(){return P})),t(a.exports,"getButtonState",(function(){return O}));var l=n("43063"),o=n("56oyT"),r=n("9yJOd"),s=n("RVqnc"),c=n("29o0l"),u=n("Nt4tV"),d=n("gkfw3"),g=n("aWXnn"),m=n("j81qC"),p=n("634r8"),f=n("bf8Wb"),h=n("hiI91"),b=n("27SDj"),k=n("c8OXT"),x=n("89k2q");const y=(0,d.default)(g.Column).attrs({align:"center"})`
  width: ${k.PHANTOM_WIDTH}px;
  margin-top: -16px;
  background: ${e=>e.background};
`,v=(0,d.default)(g.Column).attrs({align:"center"})`
  margin-top: 2rem;
`,w=(0,d.default)(g.Column).attrs({align:"center",justify:"center",width:"100%"})`
  height: 5.3rem;
`,E=(0,d.default)(h.SkeletonLoader).attrs({height:"8px",borderRadius:"6px",backgroundColor:"#484848"})`
  opacity: 0.2;
`,S=(0,d.default)(p.Row)`
  height: 8px;
  border-radius: 6px;
  background-color: ${(0,s.hexToRGB)("#999999",.5)};
  opacity: 0.5;
`,A=(0,d.default)(f.ShrinkingText)`
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
`,C=(0,d.default)(b.Text).attrs({size:15,weight:"600",color:"#FFF",lineHeight:20})``,M=(0,d.default)(b.Text).attrs({size:36,weight:"bold",color:"#777"})``,F=(0,d.default)(p.Row).attrs({justify:"center"})``,B=(0,d.default)(b.Text).attrs({weight:500,size:18})`
  margin-right: 6px;
`,D=(0,d.default)(b.Text).attrs({weight:500,size:18})`
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
`,L=d.default.div`
  padding: 16px;
  padding-bottom: 0px;
`,P=e(c).memo((({enableCTABar:t,buyButtonText:n,receiveButtonText:a,hasFungibles:i,isErrorTokens:o,isLoading:u,isHidingAllFungibles:d,isReadOnlyAccount:g,showBuyFungibleSelectionModal:p,showDepositListModal:f,showSendFungibleSelectionModal:h,value:b,earnings:k,prefetchSPLTokenMap:P,sendButtonText:z,showDollarValues:j,shouldShowPartialError:$,partialErrorMessage:U})=>{const{t:q}=(0,l.useTranslation)(),X=R(k),K=N({earnings:k,isNeutral:!j||u||d}),_=H(b),Q=V(k),J=W(b,k),{buttonTheme:G,buttonDisabled:Y}=O({isLoading:u,isEnabled:i||d,isErrorTokens:o});return e(c).createElement(y,{background:K},$?e(c).createElement(L,null,e(c).createElement(x.PartialErrorBanner,{partialErrorMessage:U})):null,e(c).createElement(v,null,j?u?e(c).createElement(w,null,e(c).createElement(E,{width:"184px",margin:"0 0 10px 0"}),e(c).createElement(E,{width:"112px"})):i||d?e(c).createElement(e(c).Fragment,null,e(c).createElement(A,{maxFontSize:38,fontWeight:600},_),e(c).createElement(F,null,e(c).createElement(B,{color:X},Q),e(c).createElement(D,{color:X,backgroundColor:(0,s.hexToRGB)(X,.1)},J))):o?e(c).createElement(w,null,e(c).createElement(S,{width:"184px",margin:"0 0 10px 0"}),e(c).createElement(S,{width:"112px"})):null:e(c).createElement(w,null,e(c).createElement(M,null,"–"))),g?e(c).createElement(I,null,e(c).createElement(T,null,e(c).createElement(m.IconEye,{width:20,height:20,fill:"#FFFFFF"}),e(c).createElement(C,null,q("readOnlyAccountBannerWarning")))):!t&&e(c).createElement(I,null,e(c).createElement(r.Button,{onMouseEnter:P,onClick:f,disabled:Y,variant:{theme:G}},a),e(c).createElement(r.Button,{onClick:p,variant:{theme:G},disabled:Y},n),e(c).createElement(r.Button,{onClick:h,variant:{theme:G},disabled:Y},z)))})),N=({earnings:e,isNeutral:t})=>t||void 0===e||0===e?"linear-gradient(180deg, rgba(136, 136, 136, 0.05) 0%, rgba(136, 136, 136, 0) 100%)":e>0?"linear-gradient(180deg, rgba(33, 229, 111, 0.05) 0%, rgba(33, 229, 111, 0) 100%)":"linear-gradient(180deg, rgba(235, 55, 66, 0.05) 0%, rgba(235, 55, 66, 0) 100%)",R=e=>void 0===e||0===e?"#777777":e>0?"#21E56F":"#EB3742",H=e=>void 0===e?"-":0===e?"$0.00":(0,u.formatDollarAmount)(e),V=e=>void 0===e?"-":0===e?"+$0.00":(0,u.formatDollarAmount)(e,{includePlusPrefix:!0}),W=(e,t)=>{const n=void 0===t;return void 0===e||n?"-":`${n||t>=0?"+":"-"}${Math.abs((0,o.calculatePercentChange)(e-t,e)).toFixed(2)}%`},O=({isLoading:e,isEnabled:t,isErrorTokens:n})=>{let a="primary",i=!1;switch(!0){case e:a="secondary",i=!0;break;case t:a="primary",i=!1;break;case n:a="secondary",i=!0}return{buttonTheme:a,buttonDisabled:i}}})),n.register("bf8Wb",(function(a,i){t(a.exports,"ShrinkingText",(function(){return d}));var l=n("29o0l"),o=n("gkfw3"),r=n("5e82h"),s=n("27SDj");const c=o.default.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: ${e=>`${e.fontSize}px`};
  width: 100%;
`,u=(0,o.default)(s.Text)`
  font-size: ${e=>e.fontSize};
  line-height: 120%;
  font-weight: ${e=>e.fontWeight};
`,d=e(l).memo((({children:t,className:n,maxFontSize:a,fontWeight:i=500})=>{const[o,s]=(0,r.useFitText)();return e(l).createElement(c,{className:n,ref:s,fontSize:a},e(l).createElement(u,{fontSize:o,weight:i,noWrap:!0},t))}))})),n.register("5e82h",(function(e,a){t(e.exports,"useFitText",(function(){return l}));var i=n("29o0l");const l=()=>{const e=(0,i.useRef)(null),[t,n]=(0,i.useState)({fontSize:100,fontSizePrev:20,fontSizeMax:100,fontSizeMin:20}),{fontSize:a,fontSizeMax:l,fontSizeMin:o,fontSizePrev:r}=t;return(0,i.useEffect)((()=>{const t=Math.abs(a-r)<=5,i=null!==e.current&&(e.current.scrollHeight>e.current.offsetHeight||e.current.scrollWidth>e.current.offsetWidth),s=a>r;if(t){if(i){n({fontSize:r<a?r:a-(r-a),fontSizeMax:l,fontSizeMin:o,fontSizePrev:r})}return}let c,u=l,d=o;i?(c=s?r-a:o-a,u=Math.min(l,a)):(c=s?l-a:r-a,d=Math.max(o,a)),n({fontSize:a+c/2,fontSizeMax:u,fontSizeMin:d,fontSizePrev:a})}),[a,l,o,r,e]),[`${a}%`,e]}})),n.register("89k2q",(function(a,i){t(a.exports,"PartialErrorBanner",(function(){return d}));var l=n("29o0l"),o=n("gkfw3"),r=n("j81qC"),s=n("27SDj");const c=o.default.div`
  background: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(54px);
  padding: 16px;
  border-radius: 16px;
  width: 100%;
  display: flex;
  gap: 8px;
  position: relative;
`,u=(0,o.default)(s.Text)`
  color: #999999;
  font-size: 14px;
  line-height: 17px;
  font-weight: 400;
  text-align: left;
  padding: 1px 0;
`,d=({partialErrorMessage:t})=>e(l).createElement(c,null,e(l).createElement("div",null,e(l).createElement(r.IconInfoCircle,{width:18,height:18,fill:"#999999"})),e(l).createElement(u,null,t))})),n.register("bJlxR",(function(a,i){t(a.exports,"HomeError",(function(){return b}));var l=n("29o0l"),o=n("gkfw3"),r=n("aWXnn"),s=n("j81qC"),c=n("634r8"),u=n("27SDj");const d=(0,o.default)(r.Column).attrs({align:"center"})``,g=o.default.div`
  width: 48px;
  height: 48px;
  position: relative;
  margin-bottom: 15px;
  border-radius: 100%;
  background: rgba(255, 220, 98, 0.2);
`,m=(0,o.default)(c.Row).attrs({align:"center",justify:"center"})`
  height: 100%;
`,p=(0,o.default)(u.Text).attrs({size:17,weight:500,lineHeight:22,margin:"0 0 10px 0"})``,f=(0,o.default)(u.Text).attrs({size:15,weight:500,lineHeight:21,margin:"0 0 15px 0",color:"#777777"})``,h=(0,o.default)(u.Text).attrs({size:16,weight:500,lineHeight:22,margin:"0",color:"#AB9FF2"})``,b=e(l).memo((t=>e(l).createElement(d,null,e(l).createElement(g,null,e(l).createElement(m,null,e(l).createElement(s.IconExclamationMarkCircle,{width:22,exclamationFill:"transparent",circleFill:"#FFE920"}))),e(l).createElement(p,null,t.title),e(l).createElement(f,null,t.description),e(l).createElement(h,{onClick:t.refetch},t.buttonText))))})),n.register("d1JH7",(function(a,i){t(a.exports,"ManageTokenListButton",(function(){return m}));var l=n("29o0l"),o=n("gkfw3"),r=n("j81qC"),s=n("6I6Pd"),c=n("634r8"),u=n("27SDj");const d=(0,o.default)(c.Row).attrs({justify:"center",margin:"0 auto",width:"auto"})`
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
`,g=(0,o.default)(u.Text).attrs({size:16,color:"#777777",weight:500,margin:"0 0 0 10px",lineHeight:19,noWrap:!0})``,m=e(l).memo((t=>e(l).createElement(d,{onClick:t.onClick},e(l).createElement(s.IconWrapper,null,e(l).createElement(r.IconTokenListSettings,null)),e(l).createElement(g,null,t.buttonText))))})),n.register("kdiZd",(function(e,a){t(e.exports,"useWalletBalanceAnalytics",(function(){return r}));var i=n("29o0l"),l=n("6UR7D"),o=n("gX5Te");function r(e,t,n){const a=o.hooks.useIsTestnetMode(),[r,s]=(0,i.useState)(!1);(0,i.useEffect)((()=>{a||s(!1)}),[n,a]),(0,i.useEffect)((()=>{!r&&t.length&&e.length&&!a&&(l.fungibleAnalytics.walletBalance(n,t,e),s(!0))}),[n,t,e,r,a])}})),n.register("lJodL",(function(a,i){t(a.exports,"FungibleDetailPage",(function(){return Q}),(function(e){return Q=e}));var l=n("4xbAj"),o=n("iOvk1"),r=n("3ljHn"),s=n("5slFC"),c=n("fVtZG"),u=n("43063"),d=n("7gANb"),g=n("RVqnc"),m=n("bfrkk"),p=n("kAKNF"),f=n("29o0l"),h=n("iQL9s"),b=n("9CoSy"),k=n("gkfw3"),x=n("lq7YC"),y=n("fw9SR"),v=n("arJgN"),w=n("j81qC"),E=n("foUnP"),S=n("SkwOZ"),A=n("brWcm"),T=n("6Shk9"),C=n("kqJU1"),M=n("jWb4B"),F=n("9F3Q5"),B=n("2NxXf"),D=n("hsn7I"),I=n("89k2q"),L=n("d1Nvi"),P=n("gX5Te"),N=n("conwf"),R=n("feAoQ"),H=n("60vo7"),V=n("9aR5q"),W=n("twk6W"),O=function(e,t,n,a){return new(n||(n=Promise))((function(i,l){function o(e){try{s(a.next(e))}catch(e){l(e)}}function r(e){try{s(a.throw(e))}catch(e){l(e)}}function s(e){var t;e.done?i(e.value):(t=e.value,t instanceof n?t:new n((function(e){e(t)}))).then(o,r)}s((a=a.apply(e,t||[])).next())}))};const z=e(p)(0),j=k.default.div`
  margin: 24px 0 0 0;
  width: 100%;
`,$=k.default.div`
  margin: 24px 0 0 0;
  width: 100%;
`,U=k.default.div`
  margin-bottom: 9px;
  width: 100%;
`,q=k.default.div`
  margin-top: 16px;
  margin-bottom: 24px;
  width: 100%;
`,X=k.default.div`
  padding-bottom: 16px;
`,K=e=>{const{fungibleKey:t}=e,{data:[n=!1,a]}=(0,r.useFeatureFlags)(["enable-asset-details","enable-cta-bar"]),{t:i}=(0,u.useTranslation)(),{data:l}=P.hooks.useSelectedMultiChainAccount(),c=null==l?void 0:l.isReadOnly,{addresses:d}=(0,f.useMemo)((()=>{var e,t;return{addresses:null!==(e=null==l?void 0:l.addresses)&&void 0!==e?e:[],accountIdentifier:null!==(t=null==l?void 0:l.identifier)&&void 0!==t?t:""}}),[l]),{fungible:g}=P.hooks.useFungible({key:t}),{fungible:p}=P.hooks.useFungible({key:s.FungibleTokenType.SolanaNative}),k=(null==g?void 0:g.type)===s.FungibleTokenType.SolanaNative&&!c,x=void 0!==g?(0,s.parseOwnerAddress)(g):"",y=P.hooks.useFungibleExplorerUrl(g),{explorerName:v,explorerUrl:w}={explorerName:null==y?void 0:y.explorerName,explorerUrl:null==y?void 0:y.explorerUrl},E=(0,f.useMemo)((()=>({viewInExplorer:i("assetDetailViewOnExplorer",{explorer:v}),stakeSolText:i("assetDetailStakeSOL"),unwrapAllText:i("assetDetailUnwrapAll"),unwrappingSOLText:i("assetDetailUnwrappingSOL"),copyAddress:i("commandCopyTokenAddress"),reportSpam:i("commandReportAsSpam")})),[v,i]),{showValidatorListModal:S,hideValidatorListModal:T}=(0,A.useLegacyModals)(),C=(0,h.useNavigate)(),{mutateAsync:M}=P.hooks.useUnwrapSOL(),F=(0,s.useTokenAddressFromFungible)(g),{mutateAsync:B}=P.hooks.useSetVisibilityOverrides(),D=(0,f.useMemo)((()=>{const e=[];if((null==g?void 0:g.type)===s.FungibleTokenType.SPL&&g.data.mintAddress===m.NATIVE_MINT.toBase58()){const t=p,n=d.find(o.isSolanaChainAddress);!!g.data.splTokenAccountPubkey&&void 0!==n&&!!t&&+t.data.amount>b.DEFAULT_FEE.toNumber()&&!c&&e.unshift({key:"unwrap-all",label:E.unwrapAllText,onClick:()=>{O(void 0,void 0,void 0,(function*(){yield M(),C(V.Path.Notifications)}))}})}if(x&&!n){e.push({key:"view-in-explorer",label:E.viewInExplorer,onClick:()=>{window.open(w,"_blank")}}),F&&e.push({key:"copy-address",label:E.copyAddress,onClick:()=>{(0,N.copyToClipboard)(F)}});const t=(0,s.getHandleMarkAsSpam)({analytics:W.analytics,fungible:g,accountId:null==l?void 0:l.identifier,setVisibilityOverrides:B});t&&e.push({variant:H.CTAVariant.Warning,key:"report-spam",label:E.reportSpam,onClick:t})}return k&&!n&&e.push({key:"stake-sol",label:E.stakeSolText,onClick:()=>S({onClose:T})}),e}),[g,x,k,p,d,E.unwrapAllText,E.viewInExplorer,E.stakeSolText,E.copyAddress,E.reportSpam,M,C,w,S,T,n,c,F,B,null==l?void 0:l.identifier]);return a?[]:D},_=e(f).memo((t=>{var n;const{enableCTABar:a,chainAddress:i,fungible:l,fungibleName:o,actionItems:u,tokenAddress:d,fungibleSymbol:m,fungibleBalance:p,fungiblePrice:h,fungibleTokenType:b,fungiblePermanentDelegate:k,summaryItems:A,canStake:C,showUnwrapBlurEth:L,showDollarValue:P,i18nStrings:N,accounts:H,pageHeader:V,isDeveloperMode:W,developerModeStatus:O,handleShowSendModal:z,handleShowDepositFungibleModal:K,handleSwapClick:_,enableAssetDetails:Q,isReadOnlyAccount:J,isSplNonTransferable:G,derivedSpamStatus:Y,onMarkNotSpam:Z,ctaActions:ee,shouldShowPartialError:te,partialErrorMessage:ne}=t,ae=e(f).createElement(e(f).Fragment,null,e(f).createElement(y.PageHeader,{isSticky:!0,items:u.length>0?u:void 0},V),te?e(f).createElement(X,null,e(f).createElement(I.PartialErrorBanner,{partialErrorMessage:ne})):null,e(f).createElement(U,null,Q&&l?e(f).createElement(e(f).Fragment,null,e(f).createElement(F.FungibleSummaryCard,{type:l.type,chain:l.data.chain,logoUri:l.data.logoUri,name:l.data.name,price:l.data.price,priceChange24h:l.data.priceChange24h,symbol:l.data.symbol,tokenAddress:l.data.tokenAddress})):e(f).createElement(T.FungibleDetailHeader,{enableCTABar:a,chainAddress:i,balance:p,symbol:m,mint:d,dollarValue:h,fungibleTokenType:b,showDollarValue:P,sendButtonText:N.sendButtonText,receiveButtonText:N.receiveButtonText,swapButtonText:N.swapButtonText,handleShowSendModal:z,handleShowDepositFungibleModal:K,handleSwapClick:_,isReadOnlyAccount:J,isSplNonTransferable:G}),a&&!J&&e(f).createElement(q,null,e(f).createElement(x.CTABar,{actions:ee,uiContextName:"fungibleDetail"})),Y===s.SpamStatus.PossibleSpam&&e(f).createElement($,null,e(f).createElement(E.WarningCardWithActions,{message:N.spamWarning,variant:"warning",Icon:w.IconEyeOff,actions:[(null==l?void 0:l.data.spamStatus)===s.SpamStatus.PossibleSpam&&{label:N.reportAsNotSpam,onClick:Z}].filter(g.filterBoolean)})),C&&e(f).createElement(j,null,e(f).createElement(B.StartEarningSol,null)),L&&l?e(f).createElement(j,null,e(f).createElement(D.ButtonUnwrapFungible,{fungible:l})):null,k&&e(f).createElement($,null,e(f).createElement(S.WarningDialog,{message:N.permanentDelegateWarning,variant:2})),A.length>0?e(f).createElement(M.FungibleSummary,{name:o,items:A}):null)),ie=(0,c.useFetchInfiniteHistoryItems)(H),le=ie.isLoading||"loading"===O,{isError:oe}=(0,c.useFetchRefreshInfiniteHistoryItems)(H),{handleShowModalVisibility:re}=(0,R.useModals)(),se=(0,f.useCallback)((e=>re("historyItem",e)),[re]),ce=(0,f.useCallback)((e=>re("pendingTransaction",e)),[re]),{data:[ue=!1]}=(0,r.useFeatureFlags)(["enable-spam-filtering"]);return void 0===l?ae:e(f).createElement(v.HistoryList,Object.assign({header:ae,dataPages:null===(n=ie.data)||void 0===n?void 0:n.pages,isLoading:le,fetchNextPage:ie.fetchNextPage,refetch:ie.refetch,hasNextPage:ie.hasNextPage,isFetchingNextPage:ie.isFetchingNextPage,isError:ie.isError,isRefreshError:oe,isRefreshingConfirmedTxs:!1,isDeveloperMode:W,showHistoryItemModal:se,showPendingTransactionModal:ce},ue?{filter:e=>!(0,c.isSpamTransaction)(e,i?[i]:[])}:{}))})),Q=e(f).memo((t=>{const{data:n,loading:a}=(e=>{var t;const{networkID:n,fungibleKey:a,name:i,symbol:m,tokenAddress:p,walletAddress:k}=e,{data:[x=!1,y,v]}=(0,r.useFeatureFlags)(["enable-asset-details","enable-cta-bar","kill-brc20-sends"]),{showSendFungibleFormModal:w,showDepositFungibleModal:E,hideDepositFungibleModal:S}=(0,A.useLegacyModals)(),{data:T,isLoading:C}=P.hooks.useSelectedMultiChainAccount(),M=null==T?void 0:T.isReadOnly,{data:F=l.DEFAULT_DEVELOPER_MODE,status:B}=P.hooks.useDeveloperMode(),D=F.isDeveloperMode,{fungibles:I,isLoadingTokens:R,refetch:H,visibilityOverrides:j}=P.hooks.useFungibles(),$=(0,s.useFungiblesStore)((e=>e.setSendFungibleKey)),{fungible:U,fungibleName:q,fungibleSymbol:X,fungibleBalance:_,fungiblePrice:Q,fungibleTokenType:J,fungiblePermanentDelegate:G}=(0,f.useMemo)((()=>{var e,t,n;const l=I.find((e=>e.data.key===a)),o=(0,s.getPermananetDelegateAddress)(l);return{fungible:l,fungibleName:null!==(e=null==l?void 0:l.data.name)&&void 0!==e?e:i,fungibleSymbol:null!==(t=null==l?void 0:l.data.symbol)&&void 0!==t?t:m,fungibleBalance:null!==(n=null==l?void 0:l.data.balance)&&void 0!==n?n:z,fungiblePrice:null==l?void 0:l.data.usd,fungibleTokenType:null==l?void 0:l.type,fungiblePermanentDelegate:o}}),[a,I,i,m]),Y=(0,s.getDerivedSpamStatus)(j,{key:a,spamStatus:null!==(t=null==U?void 0:U.data.spamStatus)&&void 0!==t?t:s.SpamStatus.NotVerified}),{data:Z}=P.hooks.useSelectedChainAddress({networkID:n,address:null==U?void 0:U.data.walletAddress}),{t:ee}=(0,u.useTranslation)(),te=(0,f.useMemo)((()=>({recentActivityText:ee("assetDetailRecentActivity"),sendButtonText:ee("commandSend"),receiveButtonText:ee("commandReceive"),swapButtonText:ee("commandSwap"),permanentDelegateWarning:ee("assetDetailPermanentDelegateWarning",{delegate:G}),spamWarning:ee("tokenSpamWarning"),reportAsNotSpam:ee("commandReportAsNotSpam")})),[ee,G]),ne=q,ae=(0,g.truncateString)(ne,20),ie=(0,c.getTokenHistoryFilterId)(U),le=(0,f.useMemo)((()=>{const e=Z?[Z]:[];return(0,c.getAccountsWithFilter)(e,n,ie)}),[Z,n,ie]),oe=(null==U?void 0:U.data.tokenAddress)===s.BLUR_ETH_MINT_ADDRESS&&!M,re=(0,f.useCallback)((()=>{U&&($(null==U?void 0:U.data.key),w(U))}),[U,$,w]),se=(0,f.useCallback)((()=>{var e;E({accountName:null!==(e=null==T?void 0:T.name)&&void 0!==e?e:"",walletAddress:k,address:p,symbol:X,onClose:S,networkID:n})}),[null==T?void 0:T.name,S,p,k,E,X,n]),ce=!o.Chains.isSolanaNetworkID(n)||"mainnet-beta"===(0,d.getClusterBySolanaChainId)(n),{isSolana:ue}=(0,f.useMemo)((()=>{const e=I.find((e=>e.data.key===a));return{isSolana:(null==e?void 0:e.type)===s.FungibleTokenType.SolanaNative}}),[a,I]),de=ue&&!M,ge=K(e),{summaryItems:me,shouldShowPartialError:pe,partialErrorMessage:fe}=P.hooks.useFungibleDetailViewState({fungibleKey:a,account:T}),he=(0,f.useMemo)((()=>{if(U)return(0,o.encodeCaip19)((0,s.getFungibleCaip19FromFungible)(U))}),[U]),be=(0,L.useNavigateToSwapper)(),ke=(0,f.useCallback)((()=>{U&&he&&(W.analytics.capture("fungibleSwapClick",{data:{caip19:he}}),be({sellFungible:U}))}),[U,he,be]),{mutateAsync:xe}=P.hooks.useSetVisibilityOverrides(),ye=(0,f.useCallback)((()=>O(void 0,void 0,void 0,(function*(){U&&(null==T?void 0:T.identifier)&&(W.analytics.capture("fungiblesReportAsNotSpam",{data:{caip19:(0,o.encodeCaip19)((0,s.getFungibleCaip19FromFungible)(U))}}),yield xe({accountId:T.identifier,mutations:[{fungibleKey:U.data.key,visibility:s.VisibilityStatus.VisibleNotSpam}]}))}))),[T,U,xe]),ve=(0,f.useMemo)((()=>(0,s.getIsNonTransferable)(U)),[U]),we=P.hooks.useCanSwapWithNetworkID({networkID:null==Z?void 0:Z.networkID}),{showValidatorListModal:Ee,hideValidatorListModal:Se}=(0,A.useLegacyModals)(),Ae=(0,f.useCallback)((()=>Ee({onClose:Se})),[Se,Ee]),Te=(0,f.useCallback)((()=>{p&&(0,N.copyToClipboard)(p)}),[p]),{mutateAsync:Ce}=P.hooks.useUnwrapSOL(),Me=(0,h.useNavigate)(),Fe=(0,f.useCallback)((()=>O(void 0,void 0,void 0,(function*(){yield Ce(),Me(V.Path.Notifications)}))),[Me,Ce]),Be=P.hooks.useFungibleExplorerUrl(U),De=(0,f.useCallback)((()=>{window.open(null==Be?void 0:Be.explorerUrl,"_blank")}),[null==Be?void 0:Be.explorerUrl]),{ctaActions:Ie}=P.hooks.useFungibleCTAActions({balance:_,canSwap:we,chainAddress:Z,fee:b.DEFAULT_FEE,fungible:U,isReadOnlyAccount:M,isSplNonTransferable:ve,killBrc20Sends:v,onCopyTokenAccountAddressPress:Te,onDepositPress:se,onMarkNotSpam:ye,onSendPress:re,onStakeSolPress:Ae,onSwapPress:ke,onUnwrapWrappedSolPress:Fe,onViewOnExplorerPress:De,type:null!=J?J:s.FungibleTokenType.SolanaNative});return{data:(0,f.useMemo)((()=>({enableCTABar:y,chainAddress:Z,fungible:U,tokenAddress:p,fungibleName:q,fungibleSymbol:X,fungibleBalance:_,fungiblePrice:Q,fungibleTokenType:J,fungiblePermanentDelegate:G,summaryItems:me,canStake:de,showUnwrapBlurEth:oe,showDollarValue:ce,i18nStrings:te,accounts:le,actionItems:ge,pageHeader:ae,isDeveloperMode:D,developerModeStatus:B,handleShowSendModal:re,handleShowDepositFungibleModal:se,handleSwapClick:ke,refetch:H,enableAssetDetails:x,walletAddress:k,isReadOnlyAccount:M,isSplNonTransferable:(0,s.getIsNonTransferable)(U),derivedSpamStatus:Y,onMarkNotSpam:ye,ctaActions:Ie,shouldShowPartialError:pe,partialErrorMessage:fe})),[y,Z,U,p,q,X,_,Q,J,G,me,de,oe,ce,te,le,ge,ae,D,B,re,se,ke,H,x,k,M,Y,ye,Ie,pe,fe]),loading:C||R}})(t);return a?e(f).createElement(C.FungibleDetailLoader,{depositText:n.i18nStrings.receiveButtonText,sendText:n.i18nStrings.sendButtonText}):e(f).createElement(_,Object.assign({},n))}))})),n.register("foUnP",(function(e,a){t(e.exports,"WarningCardWithActions",(function(){return f}));var i=n("7gANb"),l=n("29o0l"),o=n("gkfw3"),r=n("j81qC"),s=n("27SDj");const c=o.default.div`
  display: flex;
  flex-direction: column;
  background-color: ${e=>e.color};
  width: 100%;
  border-width: 1px;
  border-style: solid;
  border-color: ${e=>e.color};
  border-radius: 12px;
  gap: 8px;
`,u=o.default.div`
  display: flex;
  margin: 16px;
  gap: 8px;
`,d=o.default.div`
  display: flex;
  justify-content: ${e=>1===e.buttonCount?"center":"space-between"};
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  padding: 4px 8px;
  margin-bottom: 4px;
`,g=o.default.div`
  padding: 3px;
`,m=o.default.button`
  border: none;
  background: transparent;
  color: #222222;
  cursor: pointer;
  padding: 8px;
  &:nth-child(1) {
    font-weight: bold;
  }
`,p=(0,o.default)(s.Text).attrs({size:14,weight:400,lineHeight:17,textAlign:"left",wordBreak:"break-word"})``,f=({message:e,inverted:t=!1,variant:n="warning",actions:a,Icon:o})=>{let s="#2A2A2A",f="#222222";switch(null!=o||(o="warning"!==n||t?r.IconExclamationMarkOctagon:r.IconExclamationMarkTriangle),n){case"warning":default:s=i.simulations.WARNING_COLOR;break;case"danger":s=i.simulations.DANGER_COLOR;break;case"error":f=i.simulations.ERROR_COLOR}return l.createElement(c,{color:s},l.createElement(u,null,l.createElement(g,null,l.createElement(o,{fill:f,width:18,height:18})),l.createElement(p,{color:f},e)),0===a.length?null:l.createElement(d,{buttonCount:a.length},a.map((e=>l.createElement(m,{key:e.label,onClick:e.onClick,type:"button"},e.label)))))}})),n.register("6Shk9",(function(a,i){t(a.exports,"FungibleDetailHeader",(function(){return x}));var l=n("4xbAj"),o=n("5slFC"),r=n("29o0l"),s=n("Nt4tV"),c=n("gkfw3"),u=n("hFkH3"),d=n("aWXnn"),g=n("bf8Wb"),m=n("27SDj"),p=n("gX5Te"),f=n("twk6W");const h=(0,c.default)(d.Column).attrs({align:"center"})`
  background: #2a2a2a;
  padding: 16px 14px;
  border-radius: 6px;
`,b=(0,c.default)(m.Text).attrs({size:16,color:"#777777"})`
  margin-top: 7px;
`,k=(0,c.default)(u.ButtonGroup)`
  margin-top: 20px;
`,x=e(r).memo((t=>{const{enableCTABar:n,mint:a,symbol:i,balance:c,dollarValue:d,fungibleTokenType:m,showDollarValue:x,sendButtonText:y,receiveButtonText:v,swapButtonText:w,chainAddress:E,isReadOnlyAccount:S,handleShowSendModal:A,handleShowDepositFungibleModal:T,handleSwapClick:C,isSplNonTransferable:M}=t,F=a?(0,l.formatAddressShort)(a):void 0,B=`${(0,s.formatTokenAmount)(c)} ${null!=i?i:F}`,D=m!==o.FungibleTokenType.BRC20||!(0,f.isFeatureEnabled)("kill-brc20-sends"),I=p.hooks.useCanSendFungible({balance:c,fungibleTokenType:m,chainAddress:E,isSendEnabledForTokenType:D,isSplNonTransferable:M}),L=p.hooks.useCanSwapWithNetworkID({networkID:null==E?void 0:E.networkID}),P=!S&&!n;return e(r).createElement(h,null,e(r).createElement(g.ShrinkingText,{maxFontSize:38},B),x&&e(r).createElement(b,null,d?(0,s.formatDollarAmount)(d):"–"),P&&e(r).createElement(k,{buttonStyle:u.ButtonPairStyle.Small,buttons:[{theme:"primary",text:v,onClick:T},I&&{theme:"primary",text:y,onClick:A},I&&L&&{theme:"primary",text:w,onClick:C}].filter(Boolean)}))}))})),n.register("kqJU1",(function(a,i){t(a.exports,"FungibleDetailLoader",(function(){return h}));var l=n("29o0l"),o=n("gkfw3"),r=n("hFkH3"),s=n("aWXnn"),c=n("634r8"),u=n("hiI91");const d=[1,2],g=(0,o.default)(c.Row)`
  height: 35px;
`,m=(0,o.default)(s.Column).attrs({align:"center"})`
  background: #2a2a2a;
  padding: 16px 14px;
  border-radius: 6px;
  margin-bottom: 24px;
`,p=o.default.div`
  width: 44px;
  height: 44px;
  margin-right: 10px;
`,f=(0,o.default)(u.SkeletonLoader).attrs({height:"8px",backgroundColor:"#484848",borderRadius:"8px"})``,h=e(l).memo((t=>e(l).createElement(e(l).Fragment,null,e(l).createElement(g,{justify:"center"},e(l).createElement(f,{width:"120px",height:"10px",margin:"0 0 7px 0"})),e(l).createElement(m,null,e(l).createElement(u.SkeletonLoader,{width:"100%",height:"70px",padding:"15px 0 30px 0"},e(l).createElement(s.Column,null,e(l).createElement(c.Row,{justify:"center",margin:"0 auto"},e(l).createElement(f,{width:"120px",height:"10px",margin:"0 0 7px 0"})),e(l).createElement(c.Row,{justify:"center",margin:"0 auto"},e(l).createElement(f,{width:"60px",height:"8px"})))),e(l).createElement(r.ButtonPair,{primaryText:t.sendText,primaryDisabled:!0,primaryTheme:"default",secondaryText:t.depositText,secondaryDisabled:!0,secondaryTheme:"default",buttonPairStyle:r.ButtonPairStyle.Small})),d.map((t=>e(l).createElement(u.SkeletonLoader,{key:`fungible-detail-row-loader-${t}`,align:"center",width:"100%",height:"74px",backgroundColor:"#2D2D2D",borderRadius:"8px",margin:"0 0 10px 0",padding:"10px"},e(l).createElement(p,null,e(l).createElement(u.SkeletonLoader,{width:"44px",height:"44px",backgroundColor:"#434343",borderRadius:"50%"})),e(l).createElement(s.Column,null,e(l).createElement(c.Row,{margin:"0 0 10px",justify:"space-between"},e(l).createElement(f,{width:"120px"}),e(l).createElement(f,{width:"60px"})),e(l).createElement(c.Row,{justify:"space-between"},e(l).createElement(f,{width:"75px"}),e(l).createElement(f,{width:"35px"})))))))))})),n.register("jWb4B",(function(a,i){t(a.exports,"FungibleSummary",(function(){return g}));var l=n("43063"),o=n("29o0l"),r=n("gkfw3"),s=n("ggMbr"),c=n("27SDj");const u=r.default.div`
  margin: 24px auto 0 auto;
  width: 100%;
`,d=(0,r.default)(c.Text).attrs({size:16,weight:500,color:"#777777",textAlign:"left",margin:"0 auto 16px 0",noWrap:!0})``,g=({name:t,items:n})=>{const{t:a}=(0,l.useTranslation)();return e(o).createElement(u,null,e(o).createElement(d,null,a("assetDetailAboutLabel",{fungibleName:t})),e(o).createElement(s.Summary,{rows:n}))}})),n.register("9F3Q5",(function(a,i){t(a.exports,"FungibleSummaryCard",(function(){return h}));var l=n("iOvk1"),o=n("29o0l"),r=n("Nt4tV"),s=n("gkfw3"),c=n("qppYH");const u=s.default.div`
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
`,f=s.default.figure`
  margin-right: 12px;
`,h=({logoUri:t,symbol:n,tokenAddress:a,chain:i,price:s,priceChange24h:h,name:b,type:k})=>{if(i.id===l.BitcoinNetworkID.Mainnet||i.id===l.BitcoinNetworkID.Testnet)return null;const x="number"==typeof h?h:e(o).createElement(e(o).Fragment,null,"—");return e(o).createElement(u,null,e(o).createElement(f,null,e(o).createElement(c.EcosystemImage,{image:{type:"fungible",src:t,fallback:n||a},tokenType:k,chainMeta:i})),e(o).createElement(d,null,e(o).createElement(g,null,b," "),e(o).createElement(p,null,n," • ",(0,r.formatDollarAmount)(s||0)," ","number"==typeof x&&0!==x?e(o).createElement(m,{positive:x>0},(0,r.formatNumber)(x,{includePlusPrefix:!0,suffix:"%"})):e(o).createElement(e(o).Fragment,null,(0,r.formatNumber)(0,{includePlusPrefix:!0,suffix:"%"})))))}})),n.register("2NxXf",(function(a,i){t(a.exports,"StartEarningSol",(function(){return A}));var l=n("43063"),o=n("7mQ3Y"),r=n("7gANb"),s=n("RVqnc"),c=n("29o0l"),u=n("gkfw3"),d=n("6UMd8"),g=n("j81qC"),m=n("8FDsw"),p=n("bhnmm"),f=n("24y7X"),h=n("27SDj"),b=n("i1NO2"),k=n("brWcm"),x=n("gX5Te"),y=n("aoqPC");const v=(0,u.default)(f.TokenRowBody)`
  display: grid;
  grid-template-columns: 44px auto;
  column-gap: 10px;
  margin-bottom: 0;
`,w=u.default.div`
  overflow: hidden;
`,E=u.default.div`
  display: grid;
  grid-template-columns: 1fr;
`,S=u.default.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
`,A=()=>{var t;const{t:n}=(0,l.useTranslation)(),{pushDetailView:a}=(0,b.useDetailViews)(),{showValidatorListModal:i,hideValidatorListModal:u}=(0,k.useLegacyModals)(),{data:f}=x.hooks.useSelectedChainAddress(o.AddressType.Solana),A=null!==(t=null==f?void 0:f.address)&&void 0!==t?t:"",T=(0,c.useMemo)((()=>(0,r.createConnectionBySolanaNetworkID)(null==f?void 0:f.networkID)),[null==f?void 0:f.networkID]),C=x.hooks.useStakeAccounts(T,A),{isFetching:M,isError:F}=C,{totalStake:B,totalRewards:D,numAccounts:I}=(0,c.useMemo)((()=>{var e;const t=null!==(e=C.data)&&void 0!==e?e:[];return{totalStake:t.reduce(((e,t)=>e+t.lamports),0),totalRewards:t.reduce(((e,t)=>{var n;return e+(null!==(n=t.inflationReward)&&void 0!==n?n:0)}),0),numAccounts:t.length}}),[C.data]);return e(c).createElement(v,{role:"button",isDisabled:M,onClick:()=>{F?C.refetch():M||(I>0?a(e(c).createElement(y.StakeAccountListPage,null)):i({onClose:u}))}},M?e(c).createElement(d.Circle,{diameter:44,color:(0,s.hexToRGB)("#AB9FF2",.2)},e(c).createElement(p.Spinner,{diameter:28})):F?e(c).createElement(d.Circle,{diameter:44,color:(0,s.hexToRGB)("#EB3742",.1)},e(c).createElement(g.IconFailure,null)):e(c).createElement(d.Circle,{diameter:44,color:"#3F3D29"},e(c).createElement(g.IconStar,null)),e(c).createElement(w,null,M?e(c).createElement(E,null,e(c).createElement(h.Text,{size:16,weight:600,lineHeight:19,textAlign:"left"},n("startEarningSolLoading")),e(c).createElement(h.Text,{color:"#777777",size:14,lineHeight:17,textAlign:"left",noWrap:!0},n("startEarningSolSearching"))):F?e(c).createElement(E,null,e(c).createElement(h.Text,{size:16,weight:600,lineHeight:19,textAlign:"left"},n("startEarningSolErrorTroubleLoading")),e(c).createElement(h.Text,{color:"#777777",size:14,lineHeight:17,textAlign:"left",noWrap:!0},n("startEarningSolErrorClosePhantom"))):I?e(c).createElement(e(c).Fragment,null,e(c).createElement(S,null,e(c).createElement(h.Text,{size:16,weight:600,lineHeight:19,textAlign:"left"},n("startEarningSolYourStake")),e(c).createElement(h.Text,{size:14,weight:400,lineHeight:17,textAlign:"right",noWrap:!0},e(c).createElement(m.SolBalance,null,B))),e(c).createElement(S,null,e(c).createElement(h.Text,{color:"#777777",size:14,lineHeight:19,textAlign:"left",noWrap:!0},I," ",1===I?"account":"accounts"),e(c).createElement(h.Text,{size:14,color:""+(D>0?"#21E56F":"#777777"),lineHeight:17,textAlign:"right",noWrap:!0},D>0?e(c).createElement(e(c).Fragment,null,"+",e(c).createElement(m.SolBalance,null,D)):"–"))):e(c).createElement(E,null,e(c).createElement(h.Text,{size:16,weight:600,lineHeight:19,textAlign:"left"},n("startEarningSolPrimaryText")),e(c).createElement(h.Text,{color:"#777777",size:14,lineHeight:17,textAlign:"left",noWrap:!0},n("startEarningSolStakeTokens")))))}})),n.register("aoqPC",(function(a,i){t(a.exports,"StakeAccountListPage",(function(){return f}));var l=n("iOvk1"),o=n("43063"),r=n("7gANb"),s=n("29o0l"),c=n("fw9SR"),u=n("j81qC"),d=n("8oN8T"),g=n("brWcm"),m=n("90wQB"),p=n("gX5Te");const f=()=>{const{t:t}=(0,o.useTranslation)(),{showValidatorListModal:n,hideValidatorListModal:a}=(0,g.useLegacyModals)(),{data:i}=p.hooks.useSelectedMultiChainAccount(),{solanaPublicKey:f,connection:h}=(0,s.useMemo)((()=>{var e,t;const n=(null!==(e=null==i?void 0:i.addresses)&&void 0!==e?e:[]).find((e=>l.Chains.isSolanaNetworkID(e.networkID))),a=null!==(t=null==n?void 0:n.address)&&void 0!==t?t:"",o=null==n?void 0:n.networkID;return{solanaPublicKey:a,connection:(0,r.createConnection)((0,r.getClusterBySolanaChainId)(o))}}),[i]),b=p.hooks.useStakeAccounts(h,f);return e(s).createElement(e(s).Fragment,null,e(s).createElement(c.PageHeader,{onIconClick:()=>n({onClose:a}),icon:e(s).createElement(u.IconPlus,null)},t("stakeAccountListViewPrimaryText")),e(s).createElement(d.FullHeightLoadingContent,{isLoading:!b.isFetched},e(s).createElement(m.StakeAccountList,null)))}})),n.register("90wQB",(function(a,i){t(a.exports,"StakeAccountList",(function(){return v}));var l=n("4xbAj"),o=n("iOvk1"),r=n("43063"),s=n("egHtJ"),c=n("7gANb"),u=n("29o0l"),d=n("gkfw3"),g=n("8pWVO"),m=n("8oN8T"),p=n("8FDsw"),f=n("2GM8F"),h=n("24y7X"),b=n("27SDj"),k=n("brWcm"),x=n("gX5Te"),y=n("twk6W");const v=()=>{var t;const{t:n}=(0,r.useTranslation)();(0,u.useEffect)((()=>(y.analytics.capture("showStakeAccountList"),()=>{y.analytics.capture("hideStakeAccountList")})),[]);const{data:a}=x.hooks.useSelectedMultiChainAccount(),{solanaPublicKey:i,connection:l}=(0,u.useMemo)((()=>{var e,t;const n=(null!==(e=null==a?void 0:a.addresses)&&void 0!==e?e:[]).find((e=>o.Chains.isSolanaNetworkID(e.networkID))),i=null!==(t=null==n?void 0:n.address)&&void 0!==t?t:"",l=null==n?void 0:n.networkID;return{solanaChainAddress:n,solanaPublicKey:i,connection:(0,c.createConnection)((0,c.getClusterBySolanaChainId)(l))}}),[a]),s=x.hooks.useStakeAccounts(l,i),d=null!==(t=s.data)&&void 0!==t?t:[];return e(u).createElement(m.FullHeightLoadingContent,{isLoading:!s.isFetched},s.isError?e(u).createElement(g.ErrorView,{title:n("errorAndOfflineSomethingWentWrong"),description:n("stakeAccountListErrorFetching"),refetch:()=>{s.isFetching||s.refetch()}}):e(u).createElement(w,{data:d,connection:l}),e(u).createElement("br",null))},w=t=>{const{t:n}=(0,r.useTranslation)(),a=D(t.connection),i=t.data.slice().sort(((e,t)=>e.lamports>t.lamports?-1:1)),l=i.filter((e=>e.type===s.StakeAccountType.Delegated)),o=i.filter((e=>e.type===s.StakeAccountType.Initialized));return l.length||o.length?e(u).createElement(e(u).Fragment,null,l.length>0&&e(u).createElement(e(u).Fragment,null,l.map((n=>{var i,l,o;const{stake:r,voter:s}=n.info.stake.delegation,c=a.get(s),d=null===(i=null==c?void 0:c.info)||void 0===i?void 0:i.name,g=null===(l=null==c?void 0:c.info)||void 0===l?void 0:l.keybaseUsername,m=null===(o=null==c?void 0:c.info)||void 0===o?void 0:o.iconUrl;return e(u).createElement(F,{key:n.pubkey,pubkey:n.pubkey,balance:n.lamports,delegatedStake:Number(r),inflationReward:n.inflationReward,voteAccountPubkey:s,name:d,keybaseUsername:g,iconUrl:m,connection:t.connection})}))),o.length>0&&e(u).createElement(e(u).Fragment,null,o.map((n=>e(u).createElement(B,{key:n.pubkey,pubkey:n.pubkey,balance:n.lamports,inflationReward:n.inflationReward,connection:t.connection}))))):e(u).createElement(E,null,e(u).createElement(b.Text,{size:16,color:"#666666"},n("stakeAccountListNoStakingAccounts")))},E=d.default.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: calc(100% - 42px);
`,S=(0,d.default)(h.TokenRowBody)`
  display: grid;
  grid-template-columns: 44px auto;
  column-gap: 10px;
`,A=(0,d.default)(f.TokenImage).attrs({width:44})``,T=d.default.div`
  overflow: hidden;
`,C=d.default.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
`,M=(0,d.default)(b.Text)`
  color: ${e=>"active"===e.activationState?"#21E56F":"inactive"===e.activationState?"#EB3742":"activating"===e.activationState||"deactivating"===e.activationState?"#FFE920":"#777777"};
`,F=t=>{var n,a,i;const{t:o}=(0,r.useTranslation)(),{showStakeAccountDetailModal:s}=(0,k.useLegacyModals)(),{data:c}=x.hooks.useKeybaseUserAvatar(t.keybaseUsername),d=null!==(a=null!==(n=t.name)&&void 0!==n?n:t.keybaseUsername)&&void 0!==a?a:(0,l.formatHashMedium)(t.voteAccountPubkey),g=x.hooks.useStakeActivationData(t.connection,t.pubkey).data,m=t.inflationReward&&t.inflationReward>0;return e(u).createElement(S,{onClick:()=>{s({stakeAccountPubkey:t.pubkey})}},e(u).createElement(A,{iconUrl:null!==(i=t.iconUrl)&&void 0!==i?i:c}),e(u).createElement(T,null,e(u).createElement(C,null,e(u).createElement(b.Text,{size:16,weight:600,lineHeight:19,textAlign:"left",noWrap:!0},d),e(u).createElement(b.Text,{size:14,weight:400,lineHeight:19,textAlign:"right",noWrap:!0},e(u).createElement(p.SolBalance,null,t.delegatedStake))),e(u).createElement(C,null,e(u).createElement(M,{size:14,activationState:null==g?void 0:g.state,lineHeight:19,textAlign:"left",textTransform:"capitalize",noWrap:!0},"activating"===(null==g?void 0:g.state)?o("stakeAccountListActivationActivating"):"","active"===(null==g?void 0:g.state)?o("stakeAccountListActivationActive"):"","inactive"===(null==g?void 0:g.state)?o("stakeAccountListActivationInactive"):"","deactivating"===(null==g?void 0:g.state)?o("stakeAccountListActivationDeactivating"):""),e(u).createElement(b.Text,{size:14,color:""+(m?"#21E56F":"#777777"),lineHeight:19,textAlign:"right",noWrap:!0},m?e(u).createElement(e(u).Fragment,null,"+",e(u).createElement(p.SolBalance,null,t.inflationReward)):"-"))))},B=t=>{const{t:n}=(0,r.useTranslation)(),{showStakeAccountDetailModal:a}=(0,k.useLegacyModals)(),i=x.hooks.useStakeActivationData(t.connection,t.pubkey).data,l=t.inflationReward&&t.inflationReward>0;return e(u).createElement(S,{onClick:()=>a({stakeAccountPubkey:t.pubkey})},e(u).createElement(A,null),e(u).createElement(T,null,e(u).createElement(C,null,e(u).createElement(b.Text,{size:16,weight:600,lineHeight:19,textAlign:"left",noWrap:!0},t.pubkey),e(u).createElement(b.Text,{size:14,weight:400,lineHeight:19,textAlign:"right",noWrap:!0},e(u).createElement(p.SolBalance,null,t.balance))),e(u).createElement(C,null,e(u).createElement(M,{size:14,activationState:null==i?void 0:i.state,lineHeight:19,textAlign:"left",textTransform:"capitalize",noWrap:!0},"activating"===(null==i?void 0:i.state)?n("stakeAccountListActivationActivating"):"","active"===(null==i?void 0:i.state)?n("stakeAccountListActivationActive"):"","inactive"===(null==i?void 0:i.state)?n("stakeAccountListActivationInactive"):"","deactivating"===(null==i?void 0:i.state)?n("stakeAccountListActivationDeactivating"):""),e(u).createElement(b.Text,{size:14,color:""+(l?"#21E56F":"#777777"),lineHeight:19,textAlign:"right",noWrap:!0},l&&"+",e(u).createElement(p.SolBalance,null,t.inflationReward)))))},D=e=>{var t;const n=x.hooks.useValidators(e),a=null!==(t=n.results)&&void 0!==t?t:[],i=(0,u.useRef)(a);i.current=a;return(0,u.useMemo)((()=>new Map(i.current.map((e=>[e.voteAccountPubkey,e])))),[n.dataUpdatedAt,i])}})),n.register("hsn7I",(function(a,i){t(a.exports,"ButtonUnwrapFungible",(function(){return f}));var l=n("43063"),o=n("29o0l"),r=n("gkfw3"),s=n("qppYH"),c=n("24y7X"),u=n("27SDj"),d=n("feAoQ");const g=(0,r.default)(c.TokenRowBody)`
  display: grid;
  grid-template-columns: 44px auto;
  column-gap: 10px;
  margin-bottom: 0;
`,m=r.default.div`
  display: grid;
  grid-template-columns: 1fr;
`,p=(0,r.default)(u.Text)`
  margin-top: 5px;
`,f=({fungible:t})=>{const{symbol:n,name:a,logoUri:i,chain:r}=t.data,{t:c}=(0,l.useTranslation)(),{handleShowModalVisibility:f}=(0,d.useModals)(),h=(0,o.useCallback)((()=>{f("approveUnwrapFungible",{fungible:t})}),[t,f]);return e(o).createElement(g,{onClick:h},e(o).createElement(s.EcosystemImage,{image:{type:"icon",preset:"swap"},size:48,badge:{src:null!=i?i:""}}),e(o).createElement(m,null,e(o).createElement(u.Text,{size:16,weight:600,lineHeight:19,textAlign:"left"},c("unwrapFungibleTitle",{tokenSymbol:n})),e(o).createElement(p,{color:"#777777",size:14,lineHeight:17,textAlign:"left"},c("unwrapFungibleDescription",{fromToken:a,toToken:r.symbol}))))}})),n.register("d1Nvi",(function(e,a){t(e.exports,"useNavigateToSwapper",(function(){return u}));var i=n("iOvk1"),l=n("5slFC"),o=n("29o0l"),r=n("iQL9s"),s=n("9aR5q");const c=e=>{const t=(0,l.getFungibleCaip19FromFungible)(e);return(0,i.encodeCaip19)(t)},u=()=>{const e=(0,r.useNavigate)();return(0,o.useCallback)((({sellFungible:t,buyFungible:n,sellAmount:a})=>{const i=new URLSearchParams;t&&i.append("sellFungible",c(t)),n&&i.append("buyFungible",c(n)),a&&i.append("sellAmount",a),e(`${s.Path.Swap}?${i.toString()}`)}),[e])}}))}();
//# sourceMappingURL=HomeTabPage.461b9d42.js.map
define=__define;})(window.define);