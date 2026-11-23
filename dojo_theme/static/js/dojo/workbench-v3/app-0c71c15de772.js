"use strict";(()=>{var rC=Object.create;var $c=Object.defineProperty;var oC=Object.getOwnPropertyDescriptor;var iC=Object.getOwnPropertyNames;var uC=Object.getPrototypeOf,sC=Object.prototype.hasOwnProperty;var wt=(e,t)=>()=>(t||e((t={exports:{}}).exports,t),t.exports),Nh=(e,t)=>{for(var a in t)$c(e,a,{get:t[a],enumerable:!0})},cC=(e,t,a,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let l of iC(t))!sC.call(e,l)&&l!==a&&$c(e,l,{get:()=>t[l],enumerable:!(n=oC(t,l))||n.enumerable});return e};var W=(e,t,a)=>(a=e!=null?rC(uC(e)):{},cC(t||!e||!e.__esModule?$c(a,"default",{value:e,enumerable:!0}):a,e));var Qh=wt(re=>{"use strict";var af=Symbol.for("react.transitional.element"),fC=Symbol.for("react.portal"),dC=Symbol.for("react.fragment"),pC=Symbol.for("react.strict_mode"),mC=Symbol.for("react.profiler"),hC=Symbol.for("react.consumer"),gC=Symbol.for("react.context"),xC=Symbol.for("react.forward_ref"),yC=Symbol.for("react.suspense"),bC=Symbol.for("react.memo"),Hh=Symbol.for("react.lazy"),LC=Symbol.for("react.activity"),qh=Symbol.iterator;function vC(e){return e===null||typeof e!="object"?null:(e=qh&&e[qh]||e["@@iterator"],typeof e=="function"?e:null)}var _h={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},Gh=Object.assign,Vh={};function mr(e,t,a){this.props=e,this.context=t,this.refs=Vh,this.updater=a||_h}mr.prototype.isReactComponent={};mr.prototype.setState=function(e,t){if(typeof e!="object"&&typeof e!="function"&&e!=null)throw Error("takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,e,t,"setState")};mr.prototype.forceUpdate=function(e){this.updater.enqueueForceUpdate(this,e,"forceUpdate")};function jh(){}jh.prototype=mr.prototype;function nf(e,t,a){this.props=e,this.context=t,this.refs=Vh,this.updater=a||_h}var lf=nf.prototype=new jh;lf.constructor=nf;Gh(lf,mr.prototype);lf.isPureReactComponent=!0;var Uh=Array.isArray;function tf(){}var Me={H:null,A:null,T:null,S:null},Xh=Object.prototype.hasOwnProperty;function rf(e,t,a){var n=a.ref;return{$$typeof:af,type:e,key:t,ref:n!==void 0?n:null,props:a}}function CC(e,t){return rf(e.type,t,e.props)}function of(e){return typeof e=="object"&&e!==null&&e.$$typeof===af}function SC(e){var t={"=":"=0",":":"=2"};return"$"+e.replace(/[=:]/g,function(a){return t[a]})}var Fh=/\/+/g;function ef(e,t){return typeof e=="object"&&e!==null&&e.key!=null?SC(""+e.key):t.toString(36)}function kC(e){switch(e.status){case"fulfilled":return e.value;case"rejected":throw e.reason;default:switch(typeof e.status=="string"?e.then(tf,tf):(e.status="pending",e.then(function(t){e.status==="pending"&&(e.status="fulfilled",e.value=t)},function(t){e.status==="pending"&&(e.status="rejected",e.reason=t)})),e.status){case"fulfilled":return e.value;case"rejected":throw e.reason}}throw e}function pr(e,t,a,n,l){var r=typeof e;(r==="undefined"||r==="boolean")&&(e=null);var o=!1;if(e===null)o=!0;else switch(r){case"bigint":case"string":case"number":o=!0;break;case"object":switch(e.$$typeof){case af:case fC:o=!0;break;case Hh:return o=e._init,pr(o(e._payload),t,a,n,l)}}if(o)return l=l(e),o=n===""?"."+ef(e,0):n,Uh(l)?(a="",o!=null&&(a=o.replace(Fh,"$&/")+"/"),pr(l,t,a,"",function(c){return c})):l!=null&&(of(l)&&(l=CC(l,a+(l.key==null||e&&e.key===l.key?"":(""+l.key).replace(Fh,"$&/")+"/")+o)),t.push(l)),1;o=0;var i=n===""?".":n+":";if(Uh(e))for(var u=0;u<e.length;u++)n=e[u],r=i+ef(n,u),o+=pr(n,t,a,r,l);else if(u=vC(e),typeof u=="function")for(e=u.call(e),u=0;!(n=e.next()).done;)n=n.value,r=i+ef(n,u++),o+=pr(n,t,a,r,l);else if(r==="object"){if(typeof e.then=="function")return pr(kC(e),t,a,n,l);throw t=String(e),Error("Objects are not valid as a React child (found: "+(t==="[object Object]"?"object with keys {"+Object.keys(e).join(", ")+"}":t)+"). If you meant to render a collection of children, use an array instead.")}return o}function bu(e,t,a){if(e==null)return e;var n=[],l=0;return pr(e,n,"","",function(r){return t.call(a,r,l++)}),n}function wC(e){if(e._status===-1){var t=e._result;t=t(),t.then(function(a){(e._status===0||e._status===-1)&&(e._status=1,e._result=a)},function(a){(e._status===0||e._status===-1)&&(e._status=2,e._result=a)}),e._status===-1&&(e._status=0,e._result=t)}if(e._status===1)return e._result.default;throw e._result}var Ph=typeof reportError=="function"?reportError:function(e){if(typeof window=="object"&&typeof window.ErrorEvent=="function"){var t=new window.ErrorEvent("error",{bubbles:!0,cancelable:!0,message:typeof e=="object"&&e!==null&&typeof e.message=="string"?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if(typeof process=="object"&&typeof process.emit=="function"){process.emit("uncaughtException",e);return}console.error(e)},IC={map:bu,forEach:function(e,t,a){bu(e,function(){t.apply(this,arguments)},a)},count:function(e){var t=0;return bu(e,function(){t++}),t},toArray:function(e){return bu(e,function(t){return t})||[]},only:function(e){if(!of(e))throw Error("React.Children.only expected to receive a single React element child.");return e}};re.Activity=LC;re.Children=IC;re.Component=mr;re.Fragment=dC;re.Profiler=mC;re.PureComponent=nf;re.StrictMode=pC;re.Suspense=yC;re.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=Me;re.__COMPILER_RUNTIME={__proto__:null,c:function(e){return Me.H.useMemoCache(e)}};re.cache=function(e){return function(){return e.apply(null,arguments)}};re.cacheSignal=function(){return null};re.cloneElement=function(e,t,a){if(e==null)throw Error("The argument must be a React element, but you passed "+e+".");var n=Gh({},e.props),l=e.key;if(t!=null)for(r in t.key!==void 0&&(l=""+t.key),t)!Xh.call(t,r)||r==="key"||r==="__self"||r==="__source"||r==="ref"&&t.ref===void 0||(n[r]=t[r]);var r=arguments.length-2;if(r===1)n.children=a;else if(1<r){for(var o=Array(r),i=0;i<r;i++)o[i]=arguments[i+2];n.children=o}return rf(e.type,l,n)};re.createContext=function(e){return e={$$typeof:gC,_currentValue:e,_currentValue2:e,_threadCount:0,Provider:null,Consumer:null},e.Provider=e,e.Consumer={$$typeof:hC,_context:e},e};re.createElement=function(e,t,a){var n,l={},r=null;if(t!=null)for(n in t.key!==void 0&&(r=""+t.key),t)Xh.call(t,n)&&n!=="key"&&n!=="__self"&&n!=="__source"&&(l[n]=t[n]);var o=arguments.length-2;if(o===1)l.children=a;else if(1<o){for(var i=Array(o),u=0;u<o;u++)i[u]=arguments[u+2];l.children=i}if(e&&e.defaultProps)for(n in o=e.defaultProps,o)l[n]===void 0&&(l[n]=o[n]);return rf(e,r,l)};re.createRef=function(){return{current:null}};re.forwardRef=function(e){return{$$typeof:xC,render:e}};re.isValidElement=of;re.lazy=function(e){return{$$typeof:Hh,_payload:{_status:-1,_result:e},_init:wC}};re.memo=function(e,t){return{$$typeof:bC,type:e,compare:t===void 0?null:t}};re.startTransition=function(e){var t=Me.T,a={};Me.T=a;try{var n=e(),l=Me.S;l!==null&&l(a,n),typeof n=="object"&&n!==null&&typeof n.then=="function"&&n.then(tf,Ph)}catch(r){Ph(r)}finally{t!==null&&a.types!==null&&(t.types=a.types),Me.T=t}};re.unstable_useCacheRefresh=function(){return Me.H.useCacheRefresh()};re.use=function(e){return Me.H.use(e)};re.useActionState=function(e,t,a){return Me.H.useActionState(e,t,a)};re.useCallback=function(e,t){return Me.H.useCallback(e,t)};re.useContext=function(e){return Me.H.useContext(e)};re.useDebugValue=function(){};re.useDeferredValue=function(e,t){return Me.H.useDeferredValue(e,t)};re.useEffect=function(e,t){return Me.H.useEffect(e,t)};re.useEffectEvent=function(e){return Me.H.useEffectEvent(e)};re.useId=function(){return Me.H.useId()};re.useImperativeHandle=function(e,t,a){return Me.H.useImperativeHandle(e,t,a)};re.useInsertionEffect=function(e,t){return Me.H.useInsertionEffect(e,t)};re.useLayoutEffect=function(e,t){return Me.H.useLayoutEffect(e,t)};re.useMemo=function(e,t){return Me.H.useMemo(e,t)};re.useOptimistic=function(e,t){return Me.H.useOptimistic(e,t)};re.useReducer=function(e,t,a){return Me.H.useReducer(e,t,a)};re.useRef=function(e){return Me.H.useRef(e)};re.useState=function(e){return Me.H.useState(e)};re.useSyncExternalStore=function(e,t,a){return Me.H.useSyncExternalStore(e,t,a)};re.useTransition=function(){return Me.H.useTransition()};re.version="19.2.3"});var _e=wt((LM,Yh)=>{"use strict";Yh.exports=Qh()});var lg=wt(Oe=>{"use strict";function ff(e,t){var a=e.length;e.push(t);e:for(;0<a;){var n=a-1>>>1,l=e[n];if(0<Lu(l,t))e[n]=t,e[a]=l,a=n;else break e}}function Ta(e){return e.length===0?null:e[0]}function Cu(e){if(e.length===0)return null;var t=e[0],a=e.pop();if(a!==t){e[0]=a;e:for(var n=0,l=e.length,r=l>>>1;n<r;){var o=2*(n+1)-1,i=e[o],u=o+1,c=e[u];if(0>Lu(i,a))u<l&&0>Lu(c,i)?(e[n]=c,e[u]=a,n=u):(e[n]=i,e[o]=a,n=o);else if(u<l&&0>Lu(c,a))e[n]=c,e[u]=a,n=u;else break e}}return t}function Lu(e,t){var a=e.sortIndex-t.sortIndex;return a!==0?a:e.id-t.id}Oe.unstable_now=void 0;typeof performance=="object"&&typeof performance.now=="function"?(Kh=performance,Oe.unstable_now=function(){return Kh.now()}):(uf=Date,Zh=uf.now(),Oe.unstable_now=function(){return uf.now()-Zh});var Kh,uf,Zh,Ya=[],Dn=[],AC=1,ea=null,yt=3,df=!1,ko=!1,wo=!1,pf=!1,$h=typeof setTimeout=="function"?setTimeout:null,eg=typeof clearTimeout=="function"?clearTimeout:null,Jh=typeof setImmediate<"u"?setImmediate:null;function vu(e){for(var t=Ta(Dn);t!==null;){if(t.callback===null)Cu(Dn);else if(t.startTime<=e)Cu(Dn),t.sortIndex=t.expirationTime,ff(Ya,t);else break;t=Ta(Dn)}}function mf(e){if(wo=!1,vu(e),!ko)if(Ta(Ya)!==null)ko=!0,gr||(gr=!0,hr());else{var t=Ta(Dn);t!==null&&hf(mf,t.startTime-e)}}var gr=!1,Io=-1,tg=5,ag=-1;function ng(){return pf?!0:!(Oe.unstable_now()-ag<tg)}function sf(){if(pf=!1,gr){var e=Oe.unstable_now();ag=e;var t=!0;try{e:{ko=!1,wo&&(wo=!1,eg(Io),Io=-1),df=!0;var a=yt;try{t:{for(vu(e),ea=Ta(Ya);ea!==null&&!(ea.expirationTime>e&&ng());){var n=ea.callback;if(typeof n=="function"){ea.callback=null,yt=ea.priorityLevel;var l=n(ea.expirationTime<=e);if(e=Oe.unstable_now(),typeof l=="function"){ea.callback=l,vu(e),t=!0;break t}ea===Ta(Ya)&&Cu(Ya),vu(e)}else Cu(Ya);ea=Ta(Ya)}if(ea!==null)t=!0;else{var r=Ta(Dn);r!==null&&hf(mf,r.startTime-e),t=!1}}break e}finally{ea=null,yt=a,df=!1}t=void 0}}finally{t?hr():gr=!1}}}var hr;typeof Jh=="function"?hr=function(){Jh(sf)}:typeof MessageChannel<"u"?(cf=new MessageChannel,Wh=cf.port2,cf.port1.onmessage=sf,hr=function(){Wh.postMessage(null)}):hr=function(){$h(sf,0)};var cf,Wh;function hf(e,t){Io=$h(function(){e(Oe.unstable_now())},t)}Oe.unstable_IdlePriority=5;Oe.unstable_ImmediatePriority=1;Oe.unstable_LowPriority=4;Oe.unstable_NormalPriority=3;Oe.unstable_Profiling=null;Oe.unstable_UserBlockingPriority=2;Oe.unstable_cancelCallback=function(e){e.callback=null};Oe.unstable_forceFrameRate=function(e){0>e||125<e?console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"):tg=0<e?Math.floor(1e3/e):5};Oe.unstable_getCurrentPriorityLevel=function(){return yt};Oe.unstable_next=function(e){switch(yt){case 1:case 2:case 3:var t=3;break;default:t=yt}var a=yt;yt=t;try{return e()}finally{yt=a}};Oe.unstable_requestPaint=function(){pf=!0};Oe.unstable_runWithPriority=function(e,t){switch(e){case 1:case 2:case 3:case 4:case 5:break;default:e=3}var a=yt;yt=e;try{return t()}finally{yt=a}};Oe.unstable_scheduleCallback=function(e,t,a){var n=Oe.unstable_now();switch(typeof a=="object"&&a!==null?(a=a.delay,a=typeof a=="number"&&0<a?n+a:n):a=n,e){case 1:var l=-1;break;case 2:l=250;break;case 5:l=1073741823;break;case 4:l=1e4;break;default:l=5e3}return l=a+l,e={id:AC++,callback:t,priorityLevel:e,startTime:a,expirationTime:l,sortIndex:-1},a>n?(e.sortIndex=a,ff(Dn,e),Ta(Ya)===null&&e===Ta(Dn)&&(wo?(eg(Io),Io=-1):wo=!0,hf(mf,a-n))):(e.sortIndex=l,ff(Ya,e),ko||df||(ko=!0,gr||(gr=!0,hr()))),e};Oe.unstable_shouldYield=ng;Oe.unstable_wrapCallback=function(e){var t=yt;return function(){var a=yt;yt=t;try{return e.apply(this,arguments)}finally{yt=a}}}});var og=wt((CM,rg)=>{"use strict";rg.exports=lg()});var ug=wt(At=>{"use strict";var TC=_e();function ig(e){var t="https://react.dev/errors/"+e;if(1<arguments.length){t+="?args[]="+encodeURIComponent(arguments[1]);for(var a=2;a<arguments.length;a++)t+="&args[]="+encodeURIComponent(arguments[a])}return"Minified React error #"+e+"; visit "+t+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}function Mn(){}var It={d:{f:Mn,r:function(){throw Error(ig(522))},D:Mn,C:Mn,L:Mn,m:Mn,X:Mn,S:Mn,M:Mn},p:0,findDOMNode:null},DC=Symbol.for("react.portal");function MC(e,t,a){var n=3<arguments.length&&arguments[3]!==void 0?arguments[3]:null;return{$$typeof:DC,key:n==null?null:""+n,children:e,containerInfo:t,implementation:a}}var Ao=TC.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;function Su(e,t){if(e==="font")return"";if(typeof t=="string")return t==="use-credentials"?t:""}At.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=It;At.createPortal=function(e,t){var a=2<arguments.length&&arguments[2]!==void 0?arguments[2]:null;if(!t||t.nodeType!==1&&t.nodeType!==9&&t.nodeType!==11)throw Error(ig(299));return MC(e,t,null,a)};At.flushSync=function(e){var t=Ao.T,a=It.p;try{if(Ao.T=null,It.p=2,e)return e()}finally{Ao.T=t,It.p=a,It.d.f()}};At.preconnect=function(e,t){typeof e=="string"&&(t?(t=t.crossOrigin,t=typeof t=="string"?t==="use-credentials"?t:"":void 0):t=null,It.d.C(e,t))};At.prefetchDNS=function(e){typeof e=="string"&&It.d.D(e)};At.preinit=function(e,t){if(typeof e=="string"&&t&&typeof t.as=="string"){var a=t.as,n=Su(a,t.crossOrigin),l=typeof t.integrity=="string"?t.integrity:void 0,r=typeof t.fetchPriority=="string"?t.fetchPriority:void 0;a==="style"?It.d.S(e,typeof t.precedence=="string"?t.precedence:void 0,{crossOrigin:n,integrity:l,fetchPriority:r}):a==="script"&&It.d.X(e,{crossOrigin:n,integrity:l,fetchPriority:r,nonce:typeof t.nonce=="string"?t.nonce:void 0})}};At.preinitModule=function(e,t){if(typeof e=="string")if(typeof t=="object"&&t!==null){if(t.as==null||t.as==="script"){var a=Su(t.as,t.crossOrigin);It.d.M(e,{crossOrigin:a,integrity:typeof t.integrity=="string"?t.integrity:void 0,nonce:typeof t.nonce=="string"?t.nonce:void 0})}}else t==null&&It.d.M(e)};At.preload=function(e,t){if(typeof e=="string"&&typeof t=="object"&&t!==null&&typeof t.as=="string"){var a=t.as,n=Su(a,t.crossOrigin);It.d.L(e,a,{crossOrigin:n,integrity:typeof t.integrity=="string"?t.integrity:void 0,nonce:typeof t.nonce=="string"?t.nonce:void 0,type:typeof t.type=="string"?t.type:void 0,fetchPriority:typeof t.fetchPriority=="string"?t.fetchPriority:void 0,referrerPolicy:typeof t.referrerPolicy=="string"?t.referrerPolicy:void 0,imageSrcSet:typeof t.imageSrcSet=="string"?t.imageSrcSet:void 0,imageSizes:typeof t.imageSizes=="string"?t.imageSizes:void 0,media:typeof t.media=="string"?t.media:void 0})}};At.preloadModule=function(e,t){if(typeof e=="string")if(t){var a=Su(t.as,t.crossOrigin);It.d.m(e,{as:typeof t.as=="string"&&t.as!=="script"?t.as:void 0,crossOrigin:a,integrity:typeof t.integrity=="string"?t.integrity:void 0})}else It.d.m(e)};At.requestFormReset=function(e){It.d.r(e)};At.unstable_batchedUpdates=function(e,t){return e(t)};At.useFormState=function(e,t,a){return Ao.H.useFormState(e,t,a)};At.useFormStatus=function(){return Ao.H.useHostTransitionStatus()};At.version="19.2.3"});var fg=wt((kM,cg)=>{"use strict";function sg(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(sg)}catch(e){console.error(e)}}sg(),cg.exports=ug()});var Sb=wt(Ys=>{"use strict";var $e=og(),qx=_e(),EC=fg();function M(e){var t="https://react.dev/errors/"+e;if(1<arguments.length){t+="?args[]="+encodeURIComponent(arguments[1]);for(var a=2;a<arguments.length;a++)t+="&args[]="+encodeURIComponent(arguments[a])}return"Minified React error #"+e+"; visit "+t+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}function Ux(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11)}function pi(e){var t=e,a=e;if(e.alternate)for(;t.return;)t=t.return;else{e=t;do t=e,(t.flags&4098)!==0&&(a=t.return),e=t.return;while(e)}return t.tag===3?a:null}function Fx(e){if(e.tag===13){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function Px(e){if(e.tag===31){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function dg(e){if(pi(e)!==e)throw Error(M(188))}function zC(e){var t=e.alternate;if(!t){if(t=pi(e),t===null)throw Error(M(188));return t!==e?null:e}for(var a=e,n=t;;){var l=a.return;if(l===null)break;var r=l.alternate;if(r===null){if(n=l.return,n!==null){a=n;continue}break}if(l.child===r.child){for(r=l.child;r;){if(r===a)return dg(l),e;if(r===n)return dg(l),t;r=r.sibling}throw Error(M(188))}if(a.return!==n.return)a=l,n=r;else{for(var o=!1,i=l.child;i;){if(i===a){o=!0,a=l,n=r;break}if(i===n){o=!0,n=l,a=r;break}i=i.sibling}if(!o){for(i=r.child;i;){if(i===a){o=!0,a=r,n=l;break}if(i===n){o=!0,n=r,a=l;break}i=i.sibling}if(!o)throw Error(M(189))}}if(a.alternate!==n)throw Error(M(190))}if(a.tag!==3)throw Error(M(188));return a.stateNode.current===a?e:t}function Hx(e){var t=e.tag;if(t===5||t===26||t===27||t===6)return e;for(e=e.child;e!==null;){if(t=Hx(e),t!==null)return t;e=e.sibling}return null}var Be=Object.assign,BC=Symbol.for("react.element"),ku=Symbol.for("react.transitional.element"),Oo=Symbol.for("react.portal"),Cr=Symbol.for("react.fragment"),_x=Symbol.for("react.strict_mode"),Kf=Symbol.for("react.profiler"),Gx=Symbol.for("react.consumer"),an=Symbol.for("react.context"),Vd=Symbol.for("react.forward_ref"),Zf=Symbol.for("react.suspense"),Jf=Symbol.for("react.suspense_list"),jd=Symbol.for("react.memo"),En=Symbol.for("react.lazy");Symbol.for("react.scope");var Wf=Symbol.for("react.activity");Symbol.for("react.legacy_hidden");Symbol.for("react.tracing_marker");var RC=Symbol.for("react.memo_cache_sentinel");Symbol.for("react.view_transition");var pg=Symbol.iterator;function To(e){return e===null||typeof e!="object"?null:(e=pg&&e[pg]||e["@@iterator"],typeof e=="function"?e:null)}var OC=Symbol.for("react.client.reference");function $f(e){if(e==null)return null;if(typeof e=="function")return e.$$typeof===OC?null:e.displayName||e.name||null;if(typeof e=="string")return e;switch(e){case Cr:return"Fragment";case Kf:return"Profiler";case _x:return"StrictMode";case Zf:return"Suspense";case Jf:return"SuspenseList";case Wf:return"Activity"}if(typeof e=="object")switch(e.$$typeof){case Oo:return"Portal";case an:return e.displayName||"Context";case Gx:return(e._context.displayName||"Context")+".Consumer";case Vd:var t=e.render;return e=e.displayName,e||(e=t.displayName||t.name||"",e=e!==""?"ForwardRef("+e+")":"ForwardRef"),e;case jd:return t=e.displayName||null,t!==null?t:$f(e.type)||"Memo";case En:t=e._payload,e=e._init;try{return $f(e(t))}catch{}}return null}var No=Array.isArray,$=qx.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,be=EC.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,Sl={pending:!1,data:null,method:null,action:null},ed=[],Sr=-1;function Ba(e){return{current:e}}function lt(e){0>Sr||(e.current=ed[Sr],ed[Sr]=null,Sr--)}function De(e,t){Sr++,ed[Sr]=e.current,e.current=t}var za=Ba(null),$o=Ba(null),_n=Ba(null),ns=Ba(null);function ls(e,t){switch(De(_n,t),De($o,e),De(za,null),t.nodeType){case 9:case 11:e=(e=t.documentElement)&&(e=e.namespaceURI)?Lx(e):0;break;default:if(e=t.tagName,t=t.namespaceURI)t=Lx(t),e=sb(t,e);else switch(e){case"svg":e=1;break;case"math":e=2;break;default:e=0}}lt(za),De(za,e)}function Hr(){lt(za),lt($o),lt(_n)}function td(e){e.memoizedState!==null&&De(ns,e);var t=za.current,a=sb(t,e.type);t!==a&&(De($o,e),De(za,a))}function rs(e){$o.current===e&&(lt(za),lt($o)),ns.current===e&&(lt(ns),ci._currentValue=Sl)}var gf,mg;function bl(e){if(gf===void 0)try{throw Error()}catch(a){var t=a.stack.trim().match(/\n( *(at )?)/);gf=t&&t[1]||"",mg=-1<a.stack.indexOf(`
    at`)?" (<anonymous>)":-1<a.stack.indexOf("@")?"@unknown:0:0":""}return`
`+gf+e+mg}var xf=!1;function yf(e,t){if(!e||xf)return"";xf=!0;var a=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{var n={DetermineComponentFrameRoot:function(){try{if(t){var f=function(){throw Error()};if(Object.defineProperty(f.prototype,"props",{set:function(){throw Error()}}),typeof Reflect=="object"&&Reflect.construct){try{Reflect.construct(f,[])}catch(d){var p=d}Reflect.construct(e,[],f)}else{try{f.call()}catch(d){p=d}e.call(f.prototype)}}else{try{throw Error()}catch(d){p=d}(f=e())&&typeof f.catch=="function"&&f.catch(function(){})}}catch(d){if(d&&p&&typeof d.stack=="string")return[d.stack,p.stack]}return[null,null]}};n.DetermineComponentFrameRoot.displayName="DetermineComponentFrameRoot";var l=Object.getOwnPropertyDescriptor(n.DetermineComponentFrameRoot,"name");l&&l.configurable&&Object.defineProperty(n.DetermineComponentFrameRoot,"name",{value:"DetermineComponentFrameRoot"});var r=n.DetermineComponentFrameRoot(),o=r[0],i=r[1];if(o&&i){var u=o.split(`
`),c=i.split(`
`);for(l=n=0;n<u.length&&!u[n].includes("DetermineComponentFrameRoot");)n++;for(;l<c.length&&!c[l].includes("DetermineComponentFrameRoot");)l++;if(n===u.length||l===c.length)for(n=u.length-1,l=c.length-1;1<=n&&0<=l&&u[n]!==c[l];)l--;for(;1<=n&&0<=l;n--,l--)if(u[n]!==c[l]){if(n!==1||l!==1)do if(n--,l--,0>l||u[n]!==c[l]){var s=`
`+u[n].replace(" at new "," at ");return e.displayName&&s.includes("<anonymous>")&&(s=s.replace("<anonymous>",e.displayName)),s}while(1<=n&&0<=l);break}}}finally{xf=!1,Error.prepareStackTrace=a}return(a=e?e.displayName||e.name:"")?bl(a):""}function NC(e,t){switch(e.tag){case 26:case 27:case 5:return bl(e.type);case 16:return bl("Lazy");case 13:return e.child!==t&&t!==null?bl("Suspense Fallback"):bl("Suspense");case 19:return bl("SuspenseList");case 0:case 15:return yf(e.type,!1);case 11:return yf(e.type.render,!1);case 1:return yf(e.type,!0);case 31:return bl("Activity");default:return""}}function hg(e){try{var t="",a=null;do t+=NC(e,a),a=e,e=e.return;while(e);return t}catch(n){return`
Error generating stack: `+n.message+`
`+n.stack}}var ad=Object.prototype.hasOwnProperty,Xd=$e.unstable_scheduleCallback,bf=$e.unstable_cancelCallback,qC=$e.unstable_shouldYield,UC=$e.unstable_requestPaint,Qt=$e.unstable_now,FC=$e.unstable_getCurrentPriorityLevel,Vx=$e.unstable_ImmediatePriority,jx=$e.unstable_UserBlockingPriority,os=$e.unstable_NormalPriority,PC=$e.unstable_LowPriority,Xx=$e.unstable_IdlePriority,HC=$e.log,_C=$e.unstable_setDisableYieldValue,mi=null,Yt=null;function qn(e){if(typeof HC=="function"&&_C(e),Yt&&typeof Yt.setStrictMode=="function")try{Yt.setStrictMode(mi,e)}catch{}}var Kt=Math.clz32?Math.clz32:jC,GC=Math.log,VC=Math.LN2;function jC(e){return e>>>=0,e===0?32:31-(GC(e)/VC|0)|0}var wu=256,Iu=262144,Au=4194304;function Ll(e){var t=e&42;if(t!==0)return t;switch(e&-e){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:return 64;case 128:return 128;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:return e&261888;case 262144:case 524288:case 1048576:case 2097152:return e&3932160;case 4194304:case 8388608:case 16777216:case 33554432:return e&62914560;case 67108864:return 67108864;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 0;default:return e}}function zs(e,t,a){var n=e.pendingLanes;if(n===0)return 0;var l=0,r=e.suspendedLanes,o=e.pingedLanes;e=e.warmLanes;var i=n&134217727;return i!==0?(n=i&~r,n!==0?l=Ll(n):(o&=i,o!==0?l=Ll(o):a||(a=i&~e,a!==0&&(l=Ll(a))))):(i=n&~r,i!==0?l=Ll(i):o!==0?l=Ll(o):a||(a=n&~e,a!==0&&(l=Ll(a)))),l===0?0:t!==0&&t!==l&&(t&r)===0&&(r=l&-l,a=t&-t,r>=a||r===32&&(a&4194048)!==0)?t:l}function hi(e,t){return(e.pendingLanes&~(e.suspendedLanes&~e.pingedLanes)&t)===0}function XC(e,t){switch(e){case 1:case 2:case 4:case 8:case 64:return t+250;case 16:case 32:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return t+5e3;case 4194304:case 8388608:case 16777216:case 33554432:return-1;case 67108864:case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function Qx(){var e=Au;return Au<<=1,(Au&62914560)===0&&(Au=4194304),e}function Lf(e){for(var t=[],a=0;31>a;a++)t.push(e);return t}function gi(e,t){e.pendingLanes|=t,t!==268435456&&(e.suspendedLanes=0,e.pingedLanes=0,e.warmLanes=0)}function QC(e,t,a,n,l,r){var o=e.pendingLanes;e.pendingLanes=a,e.suspendedLanes=0,e.pingedLanes=0,e.warmLanes=0,e.expiredLanes&=a,e.entangledLanes&=a,e.errorRecoveryDisabledLanes&=a,e.shellSuspendCounter=0;var i=e.entanglements,u=e.expirationTimes,c=e.hiddenUpdates;for(a=o&~a;0<a;){var s=31-Kt(a),f=1<<s;i[s]=0,u[s]=-1;var p=c[s];if(p!==null)for(c[s]=null,s=0;s<p.length;s++){var d=p[s];d!==null&&(d.lane&=-536870913)}a&=~f}n!==0&&Yx(e,n,0),r!==0&&l===0&&e.tag!==0&&(e.suspendedLanes|=r&~(o&~t))}function Yx(e,t,a){e.pendingLanes|=t,e.suspendedLanes&=~t;var n=31-Kt(t);e.entangledLanes|=t,e.entanglements[n]=e.entanglements[n]|1073741824|a&261930}function Kx(e,t){var a=e.entangledLanes|=t;for(e=e.entanglements;a;){var n=31-Kt(a),l=1<<n;l&t|e[n]&t&&(e[n]|=t),a&=~l}}function Zx(e,t){var a=t&-t;return a=(a&42)!==0?1:Qd(a),(a&(e.suspendedLanes|t))!==0?0:a}function Qd(e){switch(e){case 2:e=1;break;case 8:e=4;break;case 32:e=16;break;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:e=128;break;case 268435456:e=134217728;break;default:e=0}return e}function Yd(e){return e&=-e,2<e?8<e?(e&134217727)!==0?32:268435456:8:2}function Jx(){var e=be.p;return e!==0?e:(e=window.event,e===void 0?32:Lb(e.type))}function gg(e,t){var a=be.p;try{return be.p=e,t()}finally{be.p=a}}var tl=Math.random().toString(36).slice(2),ct="__reactFiber$"+tl,Nt="__reactProps$"+tl,Wr="__reactContainer$"+tl,nd="__reactEvents$"+tl,YC="__reactListeners$"+tl,KC="__reactHandles$"+tl,xg="__reactResources$"+tl,xi="__reactMarker$"+tl;function Kd(e){delete e[ct],delete e[Nt],delete e[nd],delete e[YC],delete e[KC]}function kr(e){var t=e[ct];if(t)return t;for(var a=e.parentNode;a;){if(t=a[Wr]||a[ct]){if(a=t.alternate,t.child!==null||a!==null&&a.child!==null)for(e=wx(e);e!==null;){if(a=e[ct])return a;e=wx(e)}return t}e=a,a=e.parentNode}return null}function $r(e){if(e=e[ct]||e[Wr]){var t=e.tag;if(t===5||t===6||t===13||t===31||t===26||t===27||t===3)return e}return null}function qo(e){var t=e.tag;if(t===5||t===26||t===27||t===6)return e.stateNode;throw Error(M(33))}function Rr(e){var t=e[xg];return t||(t=e[xg]={hoistableStyles:new Map,hoistableScripts:new Map}),t}function nt(e){e[xi]=!0}var Wx=new Set,$x={};function Bl(e,t){_r(e,t),_r(e+"Capture",t)}function _r(e,t){for($x[e]=t,e=0;e<t.length;e++)Wx.add(t[e])}var ZC=RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"),yg={},bg={};function JC(e){return ad.call(bg,e)?!0:ad.call(yg,e)?!1:ZC.test(e)?bg[e]=!0:(yg[e]=!0,!1)}function _u(e,t,a){if(JC(t))if(a===null)e.removeAttribute(t);else{switch(typeof a){case"undefined":case"function":case"symbol":e.removeAttribute(t);return;case"boolean":var n=t.toLowerCase().slice(0,5);if(n!=="data-"&&n!=="aria-"){e.removeAttribute(t);return}}e.setAttribute(t,""+a)}}function Tu(e,t,a){if(a===null)e.removeAttribute(t);else{switch(typeof a){case"undefined":case"function":case"symbol":case"boolean":e.removeAttribute(t);return}e.setAttribute(t,""+a)}}function Ka(e,t,a,n){if(n===null)e.removeAttribute(a);else{switch(typeof n){case"undefined":case"function":case"symbol":case"boolean":e.removeAttribute(a);return}e.setAttributeNS(t,a,""+n)}}function aa(e){switch(typeof e){case"bigint":case"boolean":case"number":case"string":case"undefined":return e;case"object":return e;default:return""}}function ey(e){var t=e.type;return(e=e.nodeName)&&e.toLowerCase()==="input"&&(t==="checkbox"||t==="radio")}function WC(e,t,a){var n=Object.getOwnPropertyDescriptor(e.constructor.prototype,t);if(!e.hasOwnProperty(t)&&typeof n<"u"&&typeof n.get=="function"&&typeof n.set=="function"){var l=n.get,r=n.set;return Object.defineProperty(e,t,{configurable:!0,get:function(){return l.call(this)},set:function(o){a=""+o,r.call(this,o)}}),Object.defineProperty(e,t,{enumerable:n.enumerable}),{getValue:function(){return a},setValue:function(o){a=""+o},stopTracking:function(){e._valueTracker=null,delete e[t]}}}}function ld(e){if(!e._valueTracker){var t=ey(e)?"checked":"value";e._valueTracker=WC(e,t,""+e[t])}}function ty(e){if(!e)return!1;var t=e._valueTracker;if(!t)return!0;var a=t.getValue(),n="";return e&&(n=ey(e)?e.checked?"true":"false":e.value),e=n,e!==a?(t.setValue(e),!0):!1}function is(e){if(e=e||(typeof document<"u"?document:void 0),typeof e>"u")return null;try{return e.activeElement||e.body}catch{return e.body}}var $C=/[\n"\\]/g;function ra(e){return e.replace($C,function(t){return"\\"+t.charCodeAt(0).toString(16)+" "})}function rd(e,t,a,n,l,r,o,i){e.name="",o!=null&&typeof o!="function"&&typeof o!="symbol"&&typeof o!="boolean"?e.type=o:e.removeAttribute("type"),t!=null?o==="number"?(t===0&&e.value===""||e.value!=t)&&(e.value=""+aa(t)):e.value!==""+aa(t)&&(e.value=""+aa(t)):o!=="submit"&&o!=="reset"||e.removeAttribute("value"),t!=null?od(e,o,aa(t)):a!=null?od(e,o,aa(a)):n!=null&&e.removeAttribute("value"),l==null&&r!=null&&(e.defaultChecked=!!r),l!=null&&(e.checked=l&&typeof l!="function"&&typeof l!="symbol"),i!=null&&typeof i!="function"&&typeof i!="symbol"&&typeof i!="boolean"?e.name=""+aa(i):e.removeAttribute("name")}function ay(e,t,a,n,l,r,o,i){if(r!=null&&typeof r!="function"&&typeof r!="symbol"&&typeof r!="boolean"&&(e.type=r),t!=null||a!=null){if(!(r!=="submit"&&r!=="reset"||t!=null)){ld(e);return}a=a!=null?""+aa(a):"",t=t!=null?""+aa(t):a,i||t===e.value||(e.value=t),e.defaultValue=t}n=n??l,n=typeof n!="function"&&typeof n!="symbol"&&!!n,e.checked=i?e.checked:!!n,e.defaultChecked=!!n,o!=null&&typeof o!="function"&&typeof o!="symbol"&&typeof o!="boolean"&&(e.name=o),ld(e)}function od(e,t,a){t==="number"&&is(e.ownerDocument)===e||e.defaultValue===""+a||(e.defaultValue=""+a)}function Or(e,t,a,n){if(e=e.options,t){t={};for(var l=0;l<a.length;l++)t["$"+a[l]]=!0;for(a=0;a<e.length;a++)l=t.hasOwnProperty("$"+e[a].value),e[a].selected!==l&&(e[a].selected=l),l&&n&&(e[a].defaultSelected=!0)}else{for(a=""+aa(a),t=null,l=0;l<e.length;l++){if(e[l].value===a){e[l].selected=!0,n&&(e[l].defaultSelected=!0);return}t!==null||e[l].disabled||(t=e[l])}t!==null&&(t.selected=!0)}}function ny(e,t,a){if(t!=null&&(t=""+aa(t),t!==e.value&&(e.value=t),a==null)){e.defaultValue!==t&&(e.defaultValue=t);return}e.defaultValue=a!=null?""+aa(a):""}function ly(e,t,a,n){if(t==null){if(n!=null){if(a!=null)throw Error(M(92));if(No(n)){if(1<n.length)throw Error(M(93));n=n[0]}a=n}a==null&&(a=""),t=a}a=aa(t),e.defaultValue=a,n=e.textContent,n===a&&n!==""&&n!==null&&(e.value=n),ld(e)}function Gr(e,t){if(t){var a=e.firstChild;if(a&&a===e.lastChild&&a.nodeType===3){a.nodeValue=t;return}}e.textContent=t}var eS=new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));function Lg(e,t,a){var n=t.indexOf("--")===0;a==null||typeof a=="boolean"||a===""?n?e.setProperty(t,""):t==="float"?e.cssFloat="":e[t]="":n?e.setProperty(t,a):typeof a!="number"||a===0||eS.has(t)?t==="float"?e.cssFloat=a:e[t]=(""+a).trim():e[t]=a+"px"}function ry(e,t,a){if(t!=null&&typeof t!="object")throw Error(M(62));if(e=e.style,a!=null){for(var n in a)!a.hasOwnProperty(n)||t!=null&&t.hasOwnProperty(n)||(n.indexOf("--")===0?e.setProperty(n,""):n==="float"?e.cssFloat="":e[n]="");for(var l in t)n=t[l],t.hasOwnProperty(l)&&a[l]!==n&&Lg(e,l,n)}else for(var r in t)t.hasOwnProperty(r)&&Lg(e,r,t[r])}function Zd(e){if(e.indexOf("-")===-1)return!1;switch(e){case"annotation-xml":case"color-profile":case"font-face":case"font-face-src":case"font-face-uri":case"font-face-format":case"font-face-name":case"missing-glyph":return!1;default:return!0}}var tS=new Map([["acceptCharset","accept-charset"],["htmlFor","for"],["httpEquiv","http-equiv"],["crossOrigin","crossorigin"],["accentHeight","accent-height"],["alignmentBaseline","alignment-baseline"],["arabicForm","arabic-form"],["baselineShift","baseline-shift"],["capHeight","cap-height"],["clipPath","clip-path"],["clipRule","clip-rule"],["colorInterpolation","color-interpolation"],["colorInterpolationFilters","color-interpolation-filters"],["colorProfile","color-profile"],["colorRendering","color-rendering"],["dominantBaseline","dominant-baseline"],["enableBackground","enable-background"],["fillOpacity","fill-opacity"],["fillRule","fill-rule"],["floodColor","flood-color"],["floodOpacity","flood-opacity"],["fontFamily","font-family"],["fontSize","font-size"],["fontSizeAdjust","font-size-adjust"],["fontStretch","font-stretch"],["fontStyle","font-style"],["fontVariant","font-variant"],["fontWeight","font-weight"],["glyphName","glyph-name"],["glyphOrientationHorizontal","glyph-orientation-horizontal"],["glyphOrientationVertical","glyph-orientation-vertical"],["horizAdvX","horiz-adv-x"],["horizOriginX","horiz-origin-x"],["imageRendering","image-rendering"],["letterSpacing","letter-spacing"],["lightingColor","lighting-color"],["markerEnd","marker-end"],["markerMid","marker-mid"],["markerStart","marker-start"],["overlinePosition","overline-position"],["overlineThickness","overline-thickness"],["paintOrder","paint-order"],["panose-1","panose-1"],["pointerEvents","pointer-events"],["renderingIntent","rendering-intent"],["shapeRendering","shape-rendering"],["stopColor","stop-color"],["stopOpacity","stop-opacity"],["strikethroughPosition","strikethrough-position"],["strikethroughThickness","strikethrough-thickness"],["strokeDasharray","stroke-dasharray"],["strokeDashoffset","stroke-dashoffset"],["strokeLinecap","stroke-linecap"],["strokeLinejoin","stroke-linejoin"],["strokeMiterlimit","stroke-miterlimit"],["strokeOpacity","stroke-opacity"],["strokeWidth","stroke-width"],["textAnchor","text-anchor"],["textDecoration","text-decoration"],["textRendering","text-rendering"],["transformOrigin","transform-origin"],["underlinePosition","underline-position"],["underlineThickness","underline-thickness"],["unicodeBidi","unicode-bidi"],["unicodeRange","unicode-range"],["unitsPerEm","units-per-em"],["vAlphabetic","v-alphabetic"],["vHanging","v-hanging"],["vIdeographic","v-ideographic"],["vMathematical","v-mathematical"],["vectorEffect","vector-effect"],["vertAdvY","vert-adv-y"],["vertOriginX","vert-origin-x"],["vertOriginY","vert-origin-y"],["wordSpacing","word-spacing"],["writingMode","writing-mode"],["xmlnsXlink","xmlns:xlink"],["xHeight","x-height"]]),aS=/^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;function Gu(e){return aS.test(""+e)?"javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')":e}function nn(){}var id=null;function Jd(e){return e=e.target||e.srcElement||window,e.correspondingUseElement&&(e=e.correspondingUseElement),e.nodeType===3?e.parentNode:e}var wr=null,Nr=null;function vg(e){var t=$r(e);if(t&&(e=t.stateNode)){var a=e[Nt]||null;e:switch(e=t.stateNode,t.type){case"input":if(rd(e,a.value,a.defaultValue,a.defaultValue,a.checked,a.defaultChecked,a.type,a.name),t=a.name,a.type==="radio"&&t!=null){for(a=e;a.parentNode;)a=a.parentNode;for(a=a.querySelectorAll('input[name="'+ra(""+t)+'"][type="radio"]'),t=0;t<a.length;t++){var n=a[t];if(n!==e&&n.form===e.form){var l=n[Nt]||null;if(!l)throw Error(M(90));rd(n,l.value,l.defaultValue,l.defaultValue,l.checked,l.defaultChecked,l.type,l.name)}}for(t=0;t<a.length;t++)n=a[t],n.form===e.form&&ty(n)}break e;case"textarea":ny(e,a.value,a.defaultValue);break e;case"select":t=a.value,t!=null&&Or(e,!!a.multiple,t,!1)}}}var vf=!1;function oy(e,t,a){if(vf)return e(t,a);vf=!0;try{var n=e(t);return n}finally{if(vf=!1,(wr!==null||Nr!==null)&&(Vs(),wr&&(t=wr,e=Nr,Nr=wr=null,vg(t),e)))for(t=0;t<e.length;t++)vg(e[t])}}function ei(e,t){var a=e.stateNode;if(a===null)return null;var n=a[Nt]||null;if(n===null)return null;a=n[t];e:switch(t){case"onClick":case"onClickCapture":case"onDoubleClick":case"onDoubleClickCapture":case"onMouseDown":case"onMouseDownCapture":case"onMouseMove":case"onMouseMoveCapture":case"onMouseUp":case"onMouseUpCapture":case"onMouseEnter":(n=!n.disabled)||(e=e.type,n=!(e==="button"||e==="input"||e==="select"||e==="textarea")),e=!n;break e;default:e=!1}if(e)return null;if(a&&typeof a!="function")throw Error(M(231,t,typeof a));return a}var sn=!(typeof window>"u"||typeof window.document>"u"||typeof window.document.createElement>"u"),ud=!1;if(sn)try{xr={},Object.defineProperty(xr,"passive",{get:function(){ud=!0}}),window.addEventListener("test",xr,xr),window.removeEventListener("test",xr,xr)}catch{ud=!1}var xr,Un=null,Wd=null,Vu=null;function iy(){if(Vu)return Vu;var e,t=Wd,a=t.length,n,l="value"in Un?Un.value:Un.textContent,r=l.length;for(e=0;e<a&&t[e]===l[e];e++);var o=a-e;for(n=1;n<=o&&t[a-n]===l[r-n];n++);return Vu=l.slice(e,1<n?1-n:void 0)}function ju(e){var t=e.keyCode;return"charCode"in e?(e=e.charCode,e===0&&t===13&&(e=13)):e=t,e===10&&(e=13),32<=e||e===13?e:0}function Du(){return!0}function Cg(){return!1}function qt(e){function t(a,n,l,r,o){this._reactName=a,this._targetInst=l,this.type=n,this.nativeEvent=r,this.target=o,this.currentTarget=null;for(var i in e)e.hasOwnProperty(i)&&(a=e[i],this[i]=a?a(r):r[i]);return this.isDefaultPrevented=(r.defaultPrevented!=null?r.defaultPrevented:r.returnValue===!1)?Du:Cg,this.isPropagationStopped=Cg,this}return Be(t.prototype,{preventDefault:function(){this.defaultPrevented=!0;var a=this.nativeEvent;a&&(a.preventDefault?a.preventDefault():typeof a.returnValue!="unknown"&&(a.returnValue=!1),this.isDefaultPrevented=Du)},stopPropagation:function(){var a=this.nativeEvent;a&&(a.stopPropagation?a.stopPropagation():typeof a.cancelBubble!="unknown"&&(a.cancelBubble=!0),this.isPropagationStopped=Du)},persist:function(){},isPersistent:Du}),t}var Rl={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(e){return e.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},Bs=qt(Rl),yi=Be({},Rl,{view:0,detail:0}),nS=qt(yi),Cf,Sf,Do,Rs=Be({},yi,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:$d,button:0,buttons:0,relatedTarget:function(e){return e.relatedTarget===void 0?e.fromElement===e.srcElement?e.toElement:e.fromElement:e.relatedTarget},movementX:function(e){return"movementX"in e?e.movementX:(e!==Do&&(Do&&e.type==="mousemove"?(Cf=e.screenX-Do.screenX,Sf=e.screenY-Do.screenY):Sf=Cf=0,Do=e),Cf)},movementY:function(e){return"movementY"in e?e.movementY:Sf}}),Sg=qt(Rs),lS=Be({},Rs,{dataTransfer:0}),rS=qt(lS),oS=Be({},yi,{relatedTarget:0}),kf=qt(oS),iS=Be({},Rl,{animationName:0,elapsedTime:0,pseudoElement:0}),uS=qt(iS),sS=Be({},Rl,{clipboardData:function(e){return"clipboardData"in e?e.clipboardData:window.clipboardData}}),cS=qt(sS),fS=Be({},Rl,{data:0}),kg=qt(fS),dS={Esc:"Escape",Spacebar:" ",Left:"ArrowLeft",Up:"ArrowUp",Right:"ArrowRight",Down:"ArrowDown",Del:"Delete",Win:"OS",Menu:"ContextMenu",Apps:"ContextMenu",Scroll:"ScrollLock",MozPrintableKey:"Unidentified"},pS={8:"Backspace",9:"Tab",12:"Clear",13:"Enter",16:"Shift",17:"Control",18:"Alt",19:"Pause",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",45:"Insert",46:"Delete",112:"F1",113:"F2",114:"F3",115:"F4",116:"F5",117:"F6",118:"F7",119:"F8",120:"F9",121:"F10",122:"F11",123:"F12",144:"NumLock",145:"ScrollLock",224:"Meta"},mS={Alt:"altKey",Control:"ctrlKey",Meta:"metaKey",Shift:"shiftKey"};function hS(e){var t=this.nativeEvent;return t.getModifierState?t.getModifierState(e):(e=mS[e])?!!t[e]:!1}function $d(){return hS}var gS=Be({},yi,{key:function(e){if(e.key){var t=dS[e.key]||e.key;if(t!=="Unidentified")return t}return e.type==="keypress"?(e=ju(e),e===13?"Enter":String.fromCharCode(e)):e.type==="keydown"||e.type==="keyup"?pS[e.keyCode]||"Unidentified":""},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,repeat:0,locale:0,getModifierState:$d,charCode:function(e){return e.type==="keypress"?ju(e):0},keyCode:function(e){return e.type==="keydown"||e.type==="keyup"?e.keyCode:0},which:function(e){return e.type==="keypress"?ju(e):e.type==="keydown"||e.type==="keyup"?e.keyCode:0}}),xS=qt(gS),yS=Be({},Rs,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0}),wg=qt(yS),bS=Be({},yi,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,ctrlKey:0,shiftKey:0,getModifierState:$d}),LS=qt(bS),vS=Be({},Rl,{propertyName:0,elapsedTime:0,pseudoElement:0}),CS=qt(vS),SS=Be({},Rs,{deltaX:function(e){return"deltaX"in e?e.deltaX:"wheelDeltaX"in e?-e.wheelDeltaX:0},deltaY:function(e){return"deltaY"in e?e.deltaY:"wheelDeltaY"in e?-e.wheelDeltaY:"wheelDelta"in e?-e.wheelDelta:0},deltaZ:0,deltaMode:0}),kS=qt(SS),wS=Be({},Rl,{newState:0,oldState:0}),IS=qt(wS),AS=[9,13,27,32],ep=sn&&"CompositionEvent"in window,Po=null;sn&&"documentMode"in document&&(Po=document.documentMode);var TS=sn&&"TextEvent"in window&&!Po,uy=sn&&(!ep||Po&&8<Po&&11>=Po),Ig=" ",Ag=!1;function sy(e,t){switch(e){case"keyup":return AS.indexOf(t.keyCode)!==-1;case"keydown":return t.keyCode!==229;case"keypress":case"mousedown":case"focusout":return!0;default:return!1}}function cy(e){return e=e.detail,typeof e=="object"&&"data"in e?e.data:null}var Ir=!1;function DS(e,t){switch(e){case"compositionend":return cy(t);case"keypress":return t.which!==32?null:(Ag=!0,Ig);case"textInput":return e=t.data,e===Ig&&Ag?null:e;default:return null}}function MS(e,t){if(Ir)return e==="compositionend"||!ep&&sy(e,t)?(e=iy(),Vu=Wd=Un=null,Ir=!1,e):null;switch(e){case"paste":return null;case"keypress":if(!(t.ctrlKey||t.altKey||t.metaKey)||t.ctrlKey&&t.altKey){if(t.char&&1<t.char.length)return t.char;if(t.which)return String.fromCharCode(t.which)}return null;case"compositionend":return uy&&t.locale!=="ko"?null:t.data;default:return null}}var ES={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function Tg(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t==="input"?!!ES[e.type]:t==="textarea"}function fy(e,t,a,n){wr?Nr?Nr.push(n):Nr=[n]:wr=n,t=ws(t,"onChange"),0<t.length&&(a=new Bs("onChange","change",null,a,n),e.push({event:a,listeners:t}))}var Ho=null,ti=null;function zS(e){ob(e,0)}function Os(e){var t=qo(e);if(ty(t))return e}function Dg(e,t){if(e==="change")return t}var dy=!1;sn&&(sn?(Eu="oninput"in document,Eu||(wf=document.createElement("div"),wf.setAttribute("oninput","return;"),Eu=typeof wf.oninput=="function"),Mu=Eu):Mu=!1,dy=Mu&&(!document.documentMode||9<document.documentMode));var Mu,Eu,wf;function Mg(){Ho&&(Ho.detachEvent("onpropertychange",py),ti=Ho=null)}function py(e){if(e.propertyName==="value"&&Os(ti)){var t=[];fy(t,ti,e,Jd(e)),oy(zS,t)}}function BS(e,t,a){e==="focusin"?(Mg(),Ho=t,ti=a,Ho.attachEvent("onpropertychange",py)):e==="focusout"&&Mg()}function RS(e){if(e==="selectionchange"||e==="keyup"||e==="keydown")return Os(ti)}function OS(e,t){if(e==="click")return Os(t)}function NS(e,t){if(e==="input"||e==="change")return Os(t)}function qS(e,t){return e===t&&(e!==0||1/e===1/t)||e!==e&&t!==t}var Jt=typeof Object.is=="function"?Object.is:qS;function ai(e,t){if(Jt(e,t))return!0;if(typeof e!="object"||e===null||typeof t!="object"||t===null)return!1;var a=Object.keys(e),n=Object.keys(t);if(a.length!==n.length)return!1;for(n=0;n<a.length;n++){var l=a[n];if(!ad.call(t,l)||!Jt(e[l],t[l]))return!1}return!0}function Eg(e){for(;e&&e.firstChild;)e=e.firstChild;return e}function zg(e,t){var a=Eg(e);e=0;for(var n;a;){if(a.nodeType===3){if(n=e+a.textContent.length,e<=t&&n>=t)return{node:a,offset:t-e};e=n}e:{for(;a;){if(a.nextSibling){a=a.nextSibling;break e}a=a.parentNode}a=void 0}a=Eg(a)}}function my(e,t){return e&&t?e===t?!0:e&&e.nodeType===3?!1:t&&t.nodeType===3?my(e,t.parentNode):"contains"in e?e.contains(t):e.compareDocumentPosition?!!(e.compareDocumentPosition(t)&16):!1:!1}function hy(e){e=e!=null&&e.ownerDocument!=null&&e.ownerDocument.defaultView!=null?e.ownerDocument.defaultView:window;for(var t=is(e.document);t instanceof e.HTMLIFrameElement;){try{var a=typeof t.contentWindow.location.href=="string"}catch{a=!1}if(a)e=t.contentWindow;else break;t=is(e.document)}return t}function tp(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t&&(t==="input"&&(e.type==="text"||e.type==="search"||e.type==="tel"||e.type==="url"||e.type==="password")||t==="textarea"||e.contentEditable==="true")}var US=sn&&"documentMode"in document&&11>=document.documentMode,Ar=null,sd=null,_o=null,cd=!1;function Bg(e,t,a){var n=a.window===a?a.document:a.nodeType===9?a:a.ownerDocument;cd||Ar==null||Ar!==is(n)||(n=Ar,"selectionStart"in n&&tp(n)?n={start:n.selectionStart,end:n.selectionEnd}:(n=(n.ownerDocument&&n.ownerDocument.defaultView||window).getSelection(),n={anchorNode:n.anchorNode,anchorOffset:n.anchorOffset,focusNode:n.focusNode,focusOffset:n.focusOffset}),_o&&ai(_o,n)||(_o=n,n=ws(sd,"onSelect"),0<n.length&&(t=new Bs("onSelect","select",null,t,a),e.push({event:t,listeners:n}),t.target=Ar)))}function yl(e,t){var a={};return a[e.toLowerCase()]=t.toLowerCase(),a["Webkit"+e]="webkit"+t,a["Moz"+e]="moz"+t,a}var Tr={animationend:yl("Animation","AnimationEnd"),animationiteration:yl("Animation","AnimationIteration"),animationstart:yl("Animation","AnimationStart"),transitionrun:yl("Transition","TransitionRun"),transitionstart:yl("Transition","TransitionStart"),transitioncancel:yl("Transition","TransitionCancel"),transitionend:yl("Transition","TransitionEnd")},If={},gy={};sn&&(gy=document.createElement("div").style,"AnimationEvent"in window||(delete Tr.animationend.animation,delete Tr.animationiteration.animation,delete Tr.animationstart.animation),"TransitionEvent"in window||delete Tr.transitionend.transition);function Ol(e){if(If[e])return If[e];if(!Tr[e])return e;var t=Tr[e],a;for(a in t)if(t.hasOwnProperty(a)&&a in gy)return If[e]=t[a];return e}var xy=Ol("animationend"),yy=Ol("animationiteration"),by=Ol("animationstart"),FS=Ol("transitionrun"),PS=Ol("transitionstart"),HS=Ol("transitioncancel"),Ly=Ol("transitionend"),vy=new Map,fd="abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");fd.push("scrollEnd");function va(e,t){vy.set(e,t),Bl(t,[e])}var us=typeof reportError=="function"?reportError:function(e){if(typeof window=="object"&&typeof window.ErrorEvent=="function"){var t=new window.ErrorEvent("error",{bubbles:!0,cancelable:!0,message:typeof e=="object"&&e!==null&&typeof e.message=="string"?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if(typeof process=="object"&&typeof process.emit=="function"){process.emit("uncaughtException",e);return}console.error(e)},ta=[],Dr=0,ap=0;function Ns(){for(var e=Dr,t=ap=Dr=0;t<e;){var a=ta[t];ta[t++]=null;var n=ta[t];ta[t++]=null;var l=ta[t];ta[t++]=null;var r=ta[t];if(ta[t++]=null,n!==null&&l!==null){var o=n.pending;o===null?l.next=l:(l.next=o.next,o.next=l),n.pending=l}r!==0&&Cy(a,l,r)}}function qs(e,t,a,n){ta[Dr++]=e,ta[Dr++]=t,ta[Dr++]=a,ta[Dr++]=n,ap|=n,e.lanes|=n,e=e.alternate,e!==null&&(e.lanes|=n)}function np(e,t,a,n){return qs(e,t,a,n),ss(e)}function Nl(e,t){return qs(e,null,null,t),ss(e)}function Cy(e,t,a){e.lanes|=a;var n=e.alternate;n!==null&&(n.lanes|=a);for(var l=!1,r=e.return;r!==null;)r.childLanes|=a,n=r.alternate,n!==null&&(n.childLanes|=a),r.tag===22&&(e=r.stateNode,e===null||e._visibility&1||(l=!0)),e=r,r=r.return;return e.tag===3?(r=e.stateNode,l&&t!==null&&(l=31-Kt(a),e=r.hiddenUpdates,n=e[l],n===null?e[l]=[t]:n.push(t),t.lane=a|536870912),r):null}function ss(e){if(50<Jo)throw Jo=0,zd=null,Error(M(185));for(var t=e.return;t!==null;)e=t,t=e.return;return e.tag===3?e.stateNode:null}var Mr={};function _S(e,t,a,n){this.tag=e,this.key=a,this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null,this.index=0,this.refCleanup=this.ref=null,this.pendingProps=t,this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null,this.mode=n,this.subtreeFlags=this.flags=0,this.deletions=null,this.childLanes=this.lanes=0,this.alternate=null}function jt(e,t,a,n){return new _S(e,t,a,n)}function lp(e){return e=e.prototype,!(!e||!e.isReactComponent)}function rn(e,t){var a=e.alternate;return a===null?(a=jt(e.tag,t,e.key,e.mode),a.elementType=e.elementType,a.type=e.type,a.stateNode=e.stateNode,a.alternate=e,e.alternate=a):(a.pendingProps=t,a.type=e.type,a.flags=0,a.subtreeFlags=0,a.deletions=null),a.flags=e.flags&65011712,a.childLanes=e.childLanes,a.lanes=e.lanes,a.child=e.child,a.memoizedProps=e.memoizedProps,a.memoizedState=e.memoizedState,a.updateQueue=e.updateQueue,t=e.dependencies,a.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext},a.sibling=e.sibling,a.index=e.index,a.ref=e.ref,a.refCleanup=e.refCleanup,a}function Sy(e,t){e.flags&=65011714;var a=e.alternate;return a===null?(e.childLanes=0,e.lanes=t,e.child=null,e.subtreeFlags=0,e.memoizedProps=null,e.memoizedState=null,e.updateQueue=null,e.dependencies=null,e.stateNode=null):(e.childLanes=a.childLanes,e.lanes=a.lanes,e.child=a.child,e.subtreeFlags=0,e.deletions=null,e.memoizedProps=a.memoizedProps,e.memoizedState=a.memoizedState,e.updateQueue=a.updateQueue,e.type=a.type,t=a.dependencies,e.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext}),e}function Xu(e,t,a,n,l,r){var o=0;if(n=e,typeof e=="function")lp(e)&&(o=1);else if(typeof e=="string")o=jk(e,a,za.current)?26:e==="html"||e==="head"||e==="body"?27:5;else e:switch(e){case Wf:return e=jt(31,a,t,l),e.elementType=Wf,e.lanes=r,e;case Cr:return kl(a.children,l,r,t);case _x:o=8,l|=24;break;case Kf:return e=jt(12,a,t,l|2),e.elementType=Kf,e.lanes=r,e;case Zf:return e=jt(13,a,t,l),e.elementType=Zf,e.lanes=r,e;case Jf:return e=jt(19,a,t,l),e.elementType=Jf,e.lanes=r,e;default:if(typeof e=="object"&&e!==null)switch(e.$$typeof){case an:o=10;break e;case Gx:o=9;break e;case Vd:o=11;break e;case jd:o=14;break e;case En:o=16,n=null;break e}o=29,a=Error(M(130,e===null?"null":typeof e,"")),n=null}return t=jt(o,a,t,l),t.elementType=e,t.type=n,t.lanes=r,t}function kl(e,t,a,n){return e=jt(7,e,n,t),e.lanes=a,e}function Af(e,t,a){return e=jt(6,e,null,t),e.lanes=a,e}function ky(e){var t=jt(18,null,null,0);return t.stateNode=e,t}function Tf(e,t,a){return t=jt(4,e.children!==null?e.children:[],e.key,t),t.lanes=a,t.stateNode={containerInfo:e.containerInfo,pendingChildren:null,implementation:e.implementation},t}var Rg=new WeakMap;function oa(e,t){if(typeof e=="object"&&e!==null){var a=Rg.get(e);return a!==void 0?a:(t={value:e,source:t,stack:hg(t)},Rg.set(e,t),t)}return{value:e,source:t,stack:hg(t)}}var Er=[],zr=0,cs=null,ni=0,na=[],la=0,Jn=null,Da=1,Ma="";function en(e,t){Er[zr++]=ni,Er[zr++]=cs,cs=e,ni=t}function wy(e,t,a){na[la++]=Da,na[la++]=Ma,na[la++]=Jn,Jn=e;var n=Da;e=Ma;var l=32-Kt(n)-1;n&=~(1<<l),a+=1;var r=32-Kt(t)+l;if(30<r){var o=l-l%5;r=(n&(1<<o)-1).toString(32),n>>=o,l-=o,Da=1<<32-Kt(t)+l|a<<l|n,Ma=r+e}else Da=1<<r|a<<l|n,Ma=e}function rp(e){e.return!==null&&(en(e,1),wy(e,1,0))}function op(e){for(;e===cs;)cs=Er[--zr],Er[zr]=null,ni=Er[--zr],Er[zr]=null;for(;e===Jn;)Jn=na[--la],na[la]=null,Ma=na[--la],na[la]=null,Da=na[--la],na[la]=null}function Iy(e,t){na[la++]=Da,na[la++]=Ma,na[la++]=Jn,Da=t.id,Ma=t.overflow,Jn=e}var ft=null,ze=null,ge=!1,Gn=null,ia=!1,dd=Error(M(519));function Wn(e){var t=Error(M(418,1<arguments.length&&arguments[1]!==void 0&&arguments[1]?"text":"HTML",""));throw li(oa(t,e)),dd}function Og(e){var t=e.stateNode,a=e.type,n=e.memoizedProps;switch(t[ct]=e,t[Nt]=n,a){case"dialog":ce("cancel",t),ce("close",t);break;case"iframe":case"object":case"embed":ce("load",t);break;case"video":case"audio":for(a=0;a<ui.length;a++)ce(ui[a],t);break;case"source":ce("error",t);break;case"img":case"image":case"link":ce("error",t),ce("load",t);break;case"details":ce("toggle",t);break;case"input":ce("invalid",t),ay(t,n.value,n.defaultValue,n.checked,n.defaultChecked,n.type,n.name,!0);break;case"select":ce("invalid",t);break;case"textarea":ce("invalid",t),ly(t,n.value,n.defaultValue,n.children)}a=n.children,typeof a!="string"&&typeof a!="number"&&typeof a!="bigint"||t.textContent===""+a||n.suppressHydrationWarning===!0||ub(t.textContent,a)?(n.popover!=null&&(ce("beforetoggle",t),ce("toggle",t)),n.onScroll!=null&&ce("scroll",t),n.onScrollEnd!=null&&ce("scrollend",t),n.onClick!=null&&(t.onclick=nn),t=!0):t=!1,t||Wn(e,!0)}function Ng(e){for(ft=e.return;ft;)switch(ft.tag){case 5:case 31:case 13:ia=!1;return;case 27:case 3:ia=!0;return;default:ft=ft.return}}function yr(e){if(e!==ft)return!1;if(!ge)return Ng(e),ge=!0,!1;var t=e.tag,a;if((a=t!==3&&t!==27)&&((a=t===5)&&(a=e.type,a=!(a!=="form"&&a!=="button")||qd(e.type,e.memoizedProps)),a=!a),a&&ze&&Wn(e),Ng(e),t===13){if(e=e.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(M(317));ze=kx(e)}else if(t===31){if(e=e.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(M(317));ze=kx(e)}else t===27?(t=ze,al(e.type)?(e=Hd,Hd=null,ze=e):ze=t):ze=ft?sa(e.stateNode.nextSibling):null;return!0}function Tl(){ze=ft=null,ge=!1}function Df(){var e=Gn;return e!==null&&(Rt===null?Rt=e:Rt.push.apply(Rt,e),Gn=null),e}function li(e){Gn===null?Gn=[e]:Gn.push(e)}var pd=Ba(null),ql=null,ln=null;function Bn(e,t,a){De(pd,t._currentValue),t._currentValue=a}function on(e){e._currentValue=pd.current,lt(pd)}function md(e,t,a){for(;e!==null;){var n=e.alternate;if((e.childLanes&t)!==t?(e.childLanes|=t,n!==null&&(n.childLanes|=t)):n!==null&&(n.childLanes&t)!==t&&(n.childLanes|=t),e===a)break;e=e.return}}function hd(e,t,a,n){var l=e.child;for(l!==null&&(l.return=e);l!==null;){var r=l.dependencies;if(r!==null){var o=l.child;r=r.firstContext;e:for(;r!==null;){var i=r;r=l;for(var u=0;u<t.length;u++)if(i.context===t[u]){r.lanes|=a,i=r.alternate,i!==null&&(i.lanes|=a),md(r.return,a,e),n||(o=null);break e}r=i.next}}else if(l.tag===18){if(o=l.return,o===null)throw Error(M(341));o.lanes|=a,r=o.alternate,r!==null&&(r.lanes|=a),md(o,a,e),o=null}else o=l.child;if(o!==null)o.return=l;else for(o=l;o!==null;){if(o===e){o=null;break}if(l=o.sibling,l!==null){l.return=o.return,o=l;break}o=o.return}l=o}}function eo(e,t,a,n){e=null;for(var l=t,r=!1;l!==null;){if(!r){if((l.flags&524288)!==0)r=!0;else if((l.flags&262144)!==0)break}if(l.tag===10){var o=l.alternate;if(o===null)throw Error(M(387));if(o=o.memoizedProps,o!==null){var i=l.type;Jt(l.pendingProps.value,o.value)||(e!==null?e.push(i):e=[i])}}else if(l===ns.current){if(o=l.alternate,o===null)throw Error(M(387));o.memoizedState.memoizedState!==l.memoizedState.memoizedState&&(e!==null?e.push(ci):e=[ci])}l=l.return}e!==null&&hd(t,e,a,n),t.flags|=262144}function fs(e){for(e=e.firstContext;e!==null;){if(!Jt(e.context._currentValue,e.memoizedValue))return!0;e=e.next}return!1}function Dl(e){ql=e,ln=null,e=e.dependencies,e!==null&&(e.firstContext=null)}function dt(e){return Ay(ql,e)}function zu(e,t){return ql===null&&Dl(e),Ay(e,t)}function Ay(e,t){var a=t._currentValue;if(t={context:t,memoizedValue:a,next:null},ln===null){if(e===null)throw Error(M(308));ln=t,e.dependencies={lanes:0,firstContext:t},e.flags|=524288}else ln=ln.next=t;return a}var GS=typeof AbortController<"u"?AbortController:function(){var e=[],t=this.signal={aborted:!1,addEventListener:function(a,n){e.push(n)}};this.abort=function(){t.aborted=!0,e.forEach(function(a){return a()})}},VS=$e.unstable_scheduleCallback,jS=$e.unstable_NormalPriority,Ke={$$typeof:an,Consumer:null,Provider:null,_currentValue:null,_currentValue2:null,_threadCount:0};function ip(){return{controller:new GS,data:new Map,refCount:0}}function bi(e){e.refCount--,e.refCount===0&&VS(jS,function(){e.controller.abort()})}var Go=null,gd=0,Vr=0,qr=null;function XS(e,t){if(Go===null){var a=Go=[];gd=0,Vr=zp(),qr={status:"pending",value:void 0,then:function(n){a.push(n)}}}return gd++,t.then(qg,qg),t}function qg(){if(--gd===0&&Go!==null){qr!==null&&(qr.status="fulfilled");var e=Go;Go=null,Vr=0,qr=null;for(var t=0;t<e.length;t++)(0,e[t])()}}function QS(e,t){var a=[],n={status:"pending",value:null,reason:null,then:function(l){a.push(l)}};return e.then(function(){n.status="fulfilled",n.value=t;for(var l=0;l<a.length;l++)(0,a[l])(t)},function(l){for(n.status="rejected",n.reason=l,l=0;l<a.length;l++)(0,a[l])(void 0)}),n}var Ug=$.S;$.S=function(e,t){H1=Qt(),typeof t=="object"&&t!==null&&typeof t.then=="function"&&XS(e,t),Ug!==null&&Ug(e,t)};var wl=Ba(null);function up(){var e=wl.current;return e!==null?e:Te.pooledCache}function Qu(e,t){t===null?De(wl,wl.current):De(wl,t.pool)}function Ty(){var e=up();return e===null?null:{parent:Ke._currentValue,pool:e}}var to=Error(M(460)),sp=Error(M(474)),Us=Error(M(542)),ds={then:function(){}};function Fg(e){return e=e.status,e==="fulfilled"||e==="rejected"}function Dy(e,t,a){switch(a=e[a],a===void 0?e.push(t):a!==t&&(t.then(nn,nn),t=a),t.status){case"fulfilled":return t.value;case"rejected":throw e=t.reason,Hg(e),e;default:if(typeof t.status=="string")t.then(nn,nn);else{if(e=Te,e!==null&&100<e.shellSuspendCounter)throw Error(M(482));e=t,e.status="pending",e.then(function(n){if(t.status==="pending"){var l=t;l.status="fulfilled",l.value=n}},function(n){if(t.status==="pending"){var l=t;l.status="rejected",l.reason=n}})}switch(t.status){case"fulfilled":return t.value;case"rejected":throw e=t.reason,Hg(e),e}throw Il=t,to}}function vl(e){try{var t=e._init;return t(e._payload)}catch(a){throw a!==null&&typeof a=="object"&&typeof a.then=="function"?(Il=a,to):a}}var Il=null;function Pg(){if(Il===null)throw Error(M(459));var e=Il;return Il=null,e}function Hg(e){if(e===to||e===Us)throw Error(M(483))}var Ur=null,ri=0;function Bu(e){var t=ri;return ri+=1,Ur===null&&(Ur=[]),Dy(Ur,e,t)}function Mo(e,t){t=t.props.ref,e.ref=t!==void 0?t:null}function Ru(e,t){throw t.$$typeof===BC?Error(M(525)):(e=Object.prototype.toString.call(t),Error(M(31,e==="[object Object]"?"object with keys {"+Object.keys(t).join(", ")+"}":e)))}function My(e){function t(g,m){if(e){var x=g.deletions;x===null?(g.deletions=[m],g.flags|=16):x.push(m)}}function a(g,m){if(!e)return null;for(;m!==null;)t(g,m),m=m.sibling;return null}function n(g){for(var m=new Map;g!==null;)g.key!==null?m.set(g.key,g):m.set(g.index,g),g=g.sibling;return m}function l(g,m){return g=rn(g,m),g.index=0,g.sibling=null,g}function r(g,m,x){return g.index=x,e?(x=g.alternate,x!==null?(x=x.index,x<m?(g.flags|=67108866,m):x):(g.flags|=67108866,m)):(g.flags|=1048576,m)}function o(g){return e&&g.alternate===null&&(g.flags|=67108866),g}function i(g,m,x,S){return m===null||m.tag!==6?(m=Af(x,g.mode,S),m.return=g,m):(m=l(m,x),m.return=g,m)}function u(g,m,x,S){var I=x.type;return I===Cr?s(g,m,x.props.children,S,x.key):m!==null&&(m.elementType===I||typeof I=="object"&&I!==null&&I.$$typeof===En&&vl(I)===m.type)?(m=l(m,x.props),Mo(m,x),m.return=g,m):(m=Xu(x.type,x.key,x.props,null,g.mode,S),Mo(m,x),m.return=g,m)}function c(g,m,x,S){return m===null||m.tag!==4||m.stateNode.containerInfo!==x.containerInfo||m.stateNode.implementation!==x.implementation?(m=Tf(x,g.mode,S),m.return=g,m):(m=l(m,x.children||[]),m.return=g,m)}function s(g,m,x,S,I){return m===null||m.tag!==7?(m=kl(x,g.mode,S,I),m.return=g,m):(m=l(m,x),m.return=g,m)}function f(g,m,x){if(typeof m=="string"&&m!==""||typeof m=="number"||typeof m=="bigint")return m=Af(""+m,g.mode,x),m.return=g,m;if(typeof m=="object"&&m!==null){switch(m.$$typeof){case ku:return x=Xu(m.type,m.key,m.props,null,g.mode,x),Mo(x,m),x.return=g,x;case Oo:return m=Tf(m,g.mode,x),m.return=g,m;case En:return m=vl(m),f(g,m,x)}if(No(m)||To(m))return m=kl(m,g.mode,x,null),m.return=g,m;if(typeof m.then=="function")return f(g,Bu(m),x);if(m.$$typeof===an)return f(g,zu(g,m),x);Ru(g,m)}return null}function p(g,m,x,S){var I=m!==null?m.key:null;if(typeof x=="string"&&x!==""||typeof x=="number"||typeof x=="bigint")return I!==null?null:i(g,m,""+x,S);if(typeof x=="object"&&x!==null){switch(x.$$typeof){case ku:return x.key===I?u(g,m,x,S):null;case Oo:return x.key===I?c(g,m,x,S):null;case En:return x=vl(x),p(g,m,x,S)}if(No(x)||To(x))return I!==null?null:s(g,m,x,S,null);if(typeof x.then=="function")return p(g,m,Bu(x),S);if(x.$$typeof===an)return p(g,m,zu(g,x),S);Ru(g,x)}return null}function d(g,m,x,S,I){if(typeof S=="string"&&S!==""||typeof S=="number"||typeof S=="bigint")return g=g.get(x)||null,i(m,g,""+S,I);if(typeof S=="object"&&S!==null){switch(S.$$typeof){case ku:return g=g.get(S.key===null?x:S.key)||null,u(m,g,S,I);case Oo:return g=g.get(S.key===null?x:S.key)||null,c(m,g,S,I);case En:return S=vl(S),d(g,m,x,S,I)}if(No(S)||To(S))return g=g.get(x)||null,s(m,g,S,I,null);if(typeof S.then=="function")return d(g,m,x,Bu(S),I);if(S.$$typeof===an)return d(g,m,x,zu(m,S),I);Ru(m,S)}return null}function h(g,m,x,S){for(var I=null,v=null,T=m,N=m=0,U=null;T!==null&&N<x.length;N++){T.index>N?(U=T,T=null):U=T.sibling;var w=p(g,T,x[N],S);if(w===null){T===null&&(T=U);break}e&&T&&w.alternate===null&&t(g,T),m=r(w,m,N),v===null?I=w:v.sibling=w,v=w,T=U}if(N===x.length)return a(g,T),ge&&en(g,N),I;if(T===null){for(;N<x.length;N++)T=f(g,x[N],S),T!==null&&(m=r(T,m,N),v===null?I=T:v.sibling=T,v=T);return ge&&en(g,N),I}for(T=n(T);N<x.length;N++)U=d(T,g,N,x[N],S),U!==null&&(e&&U.alternate!==null&&T.delete(U.key===null?N:U.key),m=r(U,m,N),v===null?I=U:v.sibling=U,v=U);return e&&T.forEach(function(ne){return t(g,ne)}),ge&&en(g,N),I}function y(g,m,x,S){if(x==null)throw Error(M(151));for(var I=null,v=null,T=m,N=m=0,U=null,w=x.next();T!==null&&!w.done;N++,w=x.next()){T.index>N?(U=T,T=null):U=T.sibling;var ne=p(g,T,w.value,S);if(ne===null){T===null&&(T=U);break}e&&T&&ne.alternate===null&&t(g,T),m=r(ne,m,N),v===null?I=ne:v.sibling=ne,v=ne,T=U}if(w.done)return a(g,T),ge&&en(g,N),I;if(T===null){for(;!w.done;N++,w=x.next())w=f(g,w.value,S),w!==null&&(m=r(w,m,N),v===null?I=w:v.sibling=w,v=w);return ge&&en(g,N),I}for(T=n(T);!w.done;N++,w=x.next())w=d(T,g,N,w.value,S),w!==null&&(e&&w.alternate!==null&&T.delete(w.key===null?N:w.key),m=r(w,m,N),v===null?I=w:v.sibling=w,v=w);return e&&T.forEach(function(te){return t(g,te)}),ge&&en(g,N),I}function k(g,m,x,S){if(typeof x=="object"&&x!==null&&x.type===Cr&&x.key===null&&(x=x.props.children),typeof x=="object"&&x!==null){switch(x.$$typeof){case ku:e:{for(var I=x.key;m!==null;){if(m.key===I){if(I=x.type,I===Cr){if(m.tag===7){a(g,m.sibling),S=l(m,x.props.children),S.return=g,g=S;break e}}else if(m.elementType===I||typeof I=="object"&&I!==null&&I.$$typeof===En&&vl(I)===m.type){a(g,m.sibling),S=l(m,x.props),Mo(S,x),S.return=g,g=S;break e}a(g,m);break}else t(g,m);m=m.sibling}x.type===Cr?(S=kl(x.props.children,g.mode,S,x.key),S.return=g,g=S):(S=Xu(x.type,x.key,x.props,null,g.mode,S),Mo(S,x),S.return=g,g=S)}return o(g);case Oo:e:{for(I=x.key;m!==null;){if(m.key===I)if(m.tag===4&&m.stateNode.containerInfo===x.containerInfo&&m.stateNode.implementation===x.implementation){a(g,m.sibling),S=l(m,x.children||[]),S.return=g,g=S;break e}else{a(g,m);break}else t(g,m);m=m.sibling}S=Tf(x,g.mode,S),S.return=g,g=S}return o(g);case En:return x=vl(x),k(g,m,x,S)}if(No(x))return h(g,m,x,S);if(To(x)){if(I=To(x),typeof I!="function")throw Error(M(150));return x=I.call(x),y(g,m,x,S)}if(typeof x.then=="function")return k(g,m,Bu(x),S);if(x.$$typeof===an)return k(g,m,zu(g,x),S);Ru(g,x)}return typeof x=="string"&&x!==""||typeof x=="number"||typeof x=="bigint"?(x=""+x,m!==null&&m.tag===6?(a(g,m.sibling),S=l(m,x),S.return=g,g=S):(a(g,m),S=Af(x,g.mode,S),S.return=g,g=S),o(g)):a(g,m)}return function(g,m,x,S){try{ri=0;var I=k(g,m,x,S);return Ur=null,I}catch(T){if(T===to||T===Us)throw T;var v=jt(29,T,null,g.mode);return v.lanes=S,v.return=g,v}finally{}}}var Ml=My(!0),Ey=My(!1),zn=!1;function cp(e){e.updateQueue={baseState:e.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,lanes:0,hiddenCallbacks:null},callbacks:null}}function xd(e,t){e=e.updateQueue,t.updateQueue===e&&(t.updateQueue={baseState:e.baseState,firstBaseUpdate:e.firstBaseUpdate,lastBaseUpdate:e.lastBaseUpdate,shared:e.shared,callbacks:null})}function Vn(e){return{lane:e,tag:0,payload:null,callback:null,next:null}}function jn(e,t,a){var n=e.updateQueue;if(n===null)return null;if(n=n.shared,(ye&2)!==0){var l=n.pending;return l===null?t.next=t:(t.next=l.next,l.next=t),n.pending=t,t=ss(e),Cy(e,null,a),t}return qs(e,n,t,a),ss(e)}function Vo(e,t,a){if(t=t.updateQueue,t!==null&&(t=t.shared,(a&4194048)!==0)){var n=t.lanes;n&=e.pendingLanes,a|=n,t.lanes=a,Kx(e,a)}}function Mf(e,t){var a=e.updateQueue,n=e.alternate;if(n!==null&&(n=n.updateQueue,a===n)){var l=null,r=null;if(a=a.firstBaseUpdate,a!==null){do{var o={lane:a.lane,tag:a.tag,payload:a.payload,callback:null,next:null};r===null?l=r=o:r=r.next=o,a=a.next}while(a!==null);r===null?l=r=t:r=r.next=t}else l=r=t;a={baseState:n.baseState,firstBaseUpdate:l,lastBaseUpdate:r,shared:n.shared,callbacks:n.callbacks},e.updateQueue=a;return}e=a.lastBaseUpdate,e===null?a.firstBaseUpdate=t:e.next=t,a.lastBaseUpdate=t}var yd=!1;function jo(){if(yd){var e=qr;if(e!==null)throw e}}function Xo(e,t,a,n){yd=!1;var l=e.updateQueue;zn=!1;var r=l.firstBaseUpdate,o=l.lastBaseUpdate,i=l.shared.pending;if(i!==null){l.shared.pending=null;var u=i,c=u.next;u.next=null,o===null?r=c:o.next=c,o=u;var s=e.alternate;s!==null&&(s=s.updateQueue,i=s.lastBaseUpdate,i!==o&&(i===null?s.firstBaseUpdate=c:i.next=c,s.lastBaseUpdate=u))}if(r!==null){var f=l.baseState;o=0,s=c=u=null,i=r;do{var p=i.lane&-536870913,d=p!==i.lane;if(d?(de&p)===p:(n&p)===p){p!==0&&p===Vr&&(yd=!0),s!==null&&(s=s.next={lane:0,tag:i.tag,payload:i.payload,callback:null,next:null});e:{var h=e,y=i;p=t;var k=a;switch(y.tag){case 1:if(h=y.payload,typeof h=="function"){f=h.call(k,f,p);break e}f=h;break e;case 3:h.flags=h.flags&-65537|128;case 0:if(h=y.payload,p=typeof h=="function"?h.call(k,f,p):h,p==null)break e;f=Be({},f,p);break e;case 2:zn=!0}}p=i.callback,p!==null&&(e.flags|=64,d&&(e.flags|=8192),d=l.callbacks,d===null?l.callbacks=[p]:d.push(p))}else d={lane:p,tag:i.tag,payload:i.payload,callback:i.callback,next:null},s===null?(c=s=d,u=f):s=s.next=d,o|=p;if(i=i.next,i===null){if(i=l.shared.pending,i===null)break;d=i,i=d.next,d.next=null,l.lastBaseUpdate=d,l.shared.pending=null}}while(!0);s===null&&(u=f),l.baseState=u,l.firstBaseUpdate=c,l.lastBaseUpdate=s,r===null&&(l.shared.lanes=0),el|=o,e.lanes=o,e.memoizedState=f}}function zy(e,t){if(typeof e!="function")throw Error(M(191,e));e.call(t)}function By(e,t){var a=e.callbacks;if(a!==null)for(e.callbacks=null,e=0;e<a.length;e++)zy(a[e],t)}var jr=Ba(null),ps=Ba(0);function _g(e,t){e=pn,De(ps,e),De(jr,t),pn=e|t.baseLanes}function bd(){De(ps,pn),De(jr,jr.current)}function fp(){pn=ps.current,lt(jr),lt(ps)}var Wt=Ba(null),ua=null;function Rn(e){var t=e.alternate;De(Ge,Ge.current&1),De(Wt,e),ua===null&&(t===null||jr.current!==null||t.memoizedState!==null)&&(ua=e)}function Ld(e){De(Ge,Ge.current),De(Wt,e),ua===null&&(ua=e)}function Ry(e){e.tag===22?(De(Ge,Ge.current),De(Wt,e),ua===null&&(ua=e)):On(e)}function On(){De(Ge,Ge.current),De(Wt,Wt.current)}function Vt(e){lt(Wt),ua===e&&(ua=null),lt(Ge)}var Ge=Ba(0);function ms(e){for(var t=e;t!==null;){if(t.tag===13){var a=t.memoizedState;if(a!==null&&(a=a.dehydrated,a===null||Fd(a)||Pd(a)))return t}else if(t.tag===19&&(t.memoizedProps.revealOrder==="forwards"||t.memoizedProps.revealOrder==="backwards"||t.memoizedProps.revealOrder==="unstable_legacy-backwards"||t.memoizedProps.revealOrder==="together")){if((t.flags&128)!==0)return t}else if(t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return null;t=t.return}t.sibling.return=t.return,t=t.sibling}return null}var cn=0,oe=null,Ie=null,Qe=null,hs=!1,Fr=!1,El=!1,gs=0,oi=0,Pr=null,YS=0;function Ue(){throw Error(M(321))}function dp(e,t){if(t===null)return!1;for(var a=0;a<t.length&&a<e.length;a++)if(!Jt(e[a],t[a]))return!1;return!0}function pp(e,t,a,n,l,r){return cn=r,oe=t,t.memoizedState=null,t.updateQueue=null,t.lanes=0,$.H=e===null||e.memoizedState===null?f1:kp,El=!1,r=a(n,l),El=!1,Fr&&(r=Ny(t,a,n,l)),Oy(e),r}function Oy(e){$.H=ii;var t=Ie!==null&&Ie.next!==null;if(cn=0,Qe=Ie=oe=null,hs=!1,oi=0,Pr=null,t)throw Error(M(300));e===null||Ze||(e=e.dependencies,e!==null&&fs(e)&&(Ze=!0))}function Ny(e,t,a,n){oe=e;var l=0;do{if(Fr&&(Pr=null),oi=0,Fr=!1,25<=l)throw Error(M(301));if(l+=1,Qe=Ie=null,e.updateQueue!=null){var r=e.updateQueue;r.lastEffect=null,r.events=null,r.stores=null,r.memoCache!=null&&(r.memoCache.index=0)}$.H=d1,r=t(a,n)}while(Fr);return r}function KS(){var e=$.H,t=e.useState()[0];return t=typeof t.then=="function"?Li(t):t,e=e.useState()[0],(Ie!==null?Ie.memoizedState:null)!==e&&(oe.flags|=1024),t}function mp(){var e=gs!==0;return gs=0,e}function hp(e,t,a){t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~a}function gp(e){if(hs){for(e=e.memoizedState;e!==null;){var t=e.queue;t!==null&&(t.pending=null),e=e.next}hs=!1}cn=0,Qe=Ie=oe=null,Fr=!1,oi=gs=0,Pr=null}function Tt(){var e={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};return Qe===null?oe.memoizedState=Qe=e:Qe=Qe.next=e,Qe}function Ve(){if(Ie===null){var e=oe.alternate;e=e!==null?e.memoizedState:null}else e=Ie.next;var t=Qe===null?oe.memoizedState:Qe.next;if(t!==null)Qe=t,Ie=e;else{if(e===null)throw oe.alternate===null?Error(M(467)):Error(M(310));Ie=e,e={memoizedState:Ie.memoizedState,baseState:Ie.baseState,baseQueue:Ie.baseQueue,queue:Ie.queue,next:null},Qe===null?oe.memoizedState=Qe=e:Qe=Qe.next=e}return Qe}function Fs(){return{lastEffect:null,events:null,stores:null,memoCache:null}}function Li(e){var t=oi;return oi+=1,Pr===null&&(Pr=[]),e=Dy(Pr,e,t),t=oe,(Qe===null?t.memoizedState:Qe.next)===null&&(t=t.alternate,$.H=t===null||t.memoizedState===null?f1:kp),e}function Ps(e){if(e!==null&&typeof e=="object"){if(typeof e.then=="function")return Li(e);if(e.$$typeof===an)return dt(e)}throw Error(M(438,String(e)))}function xp(e){var t=null,a=oe.updateQueue;if(a!==null&&(t=a.memoCache),t==null){var n=oe.alternate;n!==null&&(n=n.updateQueue,n!==null&&(n=n.memoCache,n!=null&&(t={data:n.data.map(function(l){return l.slice()}),index:0})))}if(t==null&&(t={data:[],index:0}),a===null&&(a=Fs(),oe.updateQueue=a),a.memoCache=t,a=t.data[t.index],a===void 0)for(a=t.data[t.index]=Array(e),n=0;n<e;n++)a[n]=RC;return t.index++,a}function fn(e,t){return typeof t=="function"?t(e):t}function Yu(e){var t=Ve();return yp(t,Ie,e)}function yp(e,t,a){var n=e.queue;if(n===null)throw Error(M(311));n.lastRenderedReducer=a;var l=e.baseQueue,r=n.pending;if(r!==null){if(l!==null){var o=l.next;l.next=r.next,r.next=o}t.baseQueue=l=r,n.pending=null}if(r=e.baseState,l===null)e.memoizedState=r;else{t=l.next;var i=o=null,u=null,c=t,s=!1;do{var f=c.lane&-536870913;if(f!==c.lane?(de&f)===f:(cn&f)===f){var p=c.revertLane;if(p===0)u!==null&&(u=u.next={lane:0,revertLane:0,gesture:null,action:c.action,hasEagerState:c.hasEagerState,eagerState:c.eagerState,next:null}),f===Vr&&(s=!0);else if((cn&p)===p){c=c.next,p===Vr&&(s=!0);continue}else f={lane:0,revertLane:c.revertLane,gesture:null,action:c.action,hasEagerState:c.hasEagerState,eagerState:c.eagerState,next:null},u===null?(i=u=f,o=r):u=u.next=f,oe.lanes|=p,el|=p;f=c.action,El&&a(r,f),r=c.hasEagerState?c.eagerState:a(r,f)}else p={lane:f,revertLane:c.revertLane,gesture:c.gesture,action:c.action,hasEagerState:c.hasEagerState,eagerState:c.eagerState,next:null},u===null?(i=u=p,o=r):u=u.next=p,oe.lanes|=f,el|=f;c=c.next}while(c!==null&&c!==t);if(u===null?o=r:u.next=i,!Jt(r,e.memoizedState)&&(Ze=!0,s&&(a=qr,a!==null)))throw a;e.memoizedState=r,e.baseState=o,e.baseQueue=u,n.lastRenderedState=r}return l===null&&(n.lanes=0),[e.memoizedState,n.dispatch]}function Ef(e){var t=Ve(),a=t.queue;if(a===null)throw Error(M(311));a.lastRenderedReducer=e;var n=a.dispatch,l=a.pending,r=t.memoizedState;if(l!==null){a.pending=null;var o=l=l.next;do r=e(r,o.action),o=o.next;while(o!==l);Jt(r,t.memoizedState)||(Ze=!0),t.memoizedState=r,t.baseQueue===null&&(t.baseState=r),a.lastRenderedState=r}return[r,n]}function qy(e,t,a){var n=oe,l=Ve(),r=ge;if(r){if(a===void 0)throw Error(M(407));a=a()}else a=t();var o=!Jt((Ie||l).memoizedState,a);if(o&&(l.memoizedState=a,Ze=!0),l=l.queue,bp(Py.bind(null,n,l,e),[e]),l.getSnapshot!==t||o||Qe!==null&&Qe.memoizedState.tag&1){if(n.flags|=2048,Xr(9,{destroy:void 0},Fy.bind(null,n,l,a,t),null),Te===null)throw Error(M(349));r||(cn&127)!==0||Uy(n,t,a)}return a}function Uy(e,t,a){e.flags|=16384,e={getSnapshot:t,value:a},t=oe.updateQueue,t===null?(t=Fs(),oe.updateQueue=t,t.stores=[e]):(a=t.stores,a===null?t.stores=[e]:a.push(e))}function Fy(e,t,a,n){t.value=a,t.getSnapshot=n,Hy(t)&&_y(e)}function Py(e,t,a){return a(function(){Hy(t)&&_y(e)})}function Hy(e){var t=e.getSnapshot;e=e.value;try{var a=t();return!Jt(e,a)}catch{return!0}}function _y(e){var t=Nl(e,2);t!==null&&Ot(t,e,2)}function vd(e){var t=Tt();if(typeof e=="function"){var a=e;if(e=a(),El){qn(!0);try{a()}finally{qn(!1)}}}return t.memoizedState=t.baseState=e,t.queue={pending:null,lanes:0,dispatch:null,lastRenderedReducer:fn,lastRenderedState:e},t}function Gy(e,t,a,n){return e.baseState=a,yp(e,Ie,typeof n=="function"?n:fn)}function ZS(e,t,a,n,l){if(_s(e))throw Error(M(485));if(e=t.action,e!==null){var r={payload:l,action:e,next:null,isTransition:!0,status:"pending",value:null,reason:null,listeners:[],then:function(o){r.listeners.push(o)}};$.T!==null?a(!0):r.isTransition=!1,n(r),a=t.pending,a===null?(r.next=t.pending=r,Vy(t,r)):(r.next=a.next,t.pending=a.next=r)}}function Vy(e,t){var a=t.action,n=t.payload,l=e.state;if(t.isTransition){var r=$.T,o={};$.T=o;try{var i=a(l,n),u=$.S;u!==null&&u(o,i),Gg(e,t,i)}catch(c){Cd(e,t,c)}finally{r!==null&&o.types!==null&&(r.types=o.types),$.T=r}}else try{r=a(l,n),Gg(e,t,r)}catch(c){Cd(e,t,c)}}function Gg(e,t,a){a!==null&&typeof a=="object"&&typeof a.then=="function"?a.then(function(n){Vg(e,t,n)},function(n){return Cd(e,t,n)}):Vg(e,t,a)}function Vg(e,t,a){t.status="fulfilled",t.value=a,jy(t),e.state=a,t=e.pending,t!==null&&(a=t.next,a===t?e.pending=null:(a=a.next,t.next=a,Vy(e,a)))}function Cd(e,t,a){var n=e.pending;if(e.pending=null,n!==null){n=n.next;do t.status="rejected",t.reason=a,jy(t),t=t.next;while(t!==n)}e.action=null}function jy(e){e=e.listeners;for(var t=0;t<e.length;t++)(0,e[t])()}function Xy(e,t){return t}function jg(e,t){if(ge){var a=Te.formState;if(a!==null){e:{var n=oe;if(ge){if(ze){t:{for(var l=ze,r=ia;l.nodeType!==8;){if(!r){l=null;break t}if(l=sa(l.nextSibling),l===null){l=null;break t}}r=l.data,l=r==="F!"||r==="F"?l:null}if(l){ze=sa(l.nextSibling),n=l.data==="F!";break e}}Wn(n)}n=!1}n&&(t=a[0])}}return a=Tt(),a.memoizedState=a.baseState=t,n={pending:null,lanes:0,dispatch:null,lastRenderedReducer:Xy,lastRenderedState:t},a.queue=n,a=u1.bind(null,oe,n),n.dispatch=a,n=vd(!1),r=Sp.bind(null,oe,!1,n.queue),n=Tt(),l={state:t,dispatch:null,action:e,pending:null},n.queue=l,a=ZS.bind(null,oe,l,r,a),l.dispatch=a,n.memoizedState=e,[t,a,!1]}function Xg(e){var t=Ve();return Qy(t,Ie,e)}function Qy(e,t,a){if(t=yp(e,t,Xy)[0],e=Yu(fn)[0],typeof t=="object"&&t!==null&&typeof t.then=="function")try{var n=Li(t)}catch(o){throw o===to?Us:o}else n=t;t=Ve();var l=t.queue,r=l.dispatch;return a!==t.memoizedState&&(oe.flags|=2048,Xr(9,{destroy:void 0},JS.bind(null,l,a),null)),[n,r,e]}function JS(e,t){e.action=t}function Qg(e){var t=Ve(),a=Ie;if(a!==null)return Qy(t,a,e);Ve(),t=t.memoizedState,a=Ve();var n=a.queue.dispatch;return a.memoizedState=e,[t,n,!1]}function Xr(e,t,a,n){return e={tag:e,create:a,deps:n,inst:t,next:null},t=oe.updateQueue,t===null&&(t=Fs(),oe.updateQueue=t),a=t.lastEffect,a===null?t.lastEffect=e.next=e:(n=a.next,a.next=e,e.next=n,t.lastEffect=e),e}function Yy(){return Ve().memoizedState}function Ku(e,t,a,n){var l=Tt();oe.flags|=e,l.memoizedState=Xr(1|t,{destroy:void 0},a,n===void 0?null:n)}function Hs(e,t,a,n){var l=Ve();n=n===void 0?null:n;var r=l.memoizedState.inst;Ie!==null&&n!==null&&dp(n,Ie.memoizedState.deps)?l.memoizedState=Xr(t,r,a,n):(oe.flags|=e,l.memoizedState=Xr(1|t,r,a,n))}function Yg(e,t){Ku(8390656,8,e,t)}function bp(e,t){Hs(2048,8,e,t)}function WS(e){oe.flags|=4;var t=oe.updateQueue;if(t===null)t=Fs(),oe.updateQueue=t,t.events=[e];else{var a=t.events;a===null?t.events=[e]:a.push(e)}}function Ky(e){var t=Ve().memoizedState;return WS({ref:t,nextImpl:e}),function(){if((ye&2)!==0)throw Error(M(440));return t.impl.apply(void 0,arguments)}}function Zy(e,t){return Hs(4,2,e,t)}function Jy(e,t){return Hs(4,4,e,t)}function Wy(e,t){if(typeof t=="function"){e=e();var a=t(e);return function(){typeof a=="function"?a():t(null)}}if(t!=null)return e=e(),t.current=e,function(){t.current=null}}function $y(e,t,a){a=a!=null?a.concat([e]):null,Hs(4,4,Wy.bind(null,t,e),a)}function Lp(){}function e1(e,t){var a=Ve();t=t===void 0?null:t;var n=a.memoizedState;return t!==null&&dp(t,n[1])?n[0]:(a.memoizedState=[e,t],e)}function t1(e,t){var a=Ve();t=t===void 0?null:t;var n=a.memoizedState;if(t!==null&&dp(t,n[1]))return n[0];if(n=e(),El){qn(!0);try{e()}finally{qn(!1)}}return a.memoizedState=[n,t],n}function vp(e,t,a){return a===void 0||(cn&1073741824)!==0&&(de&261930)===0?e.memoizedState=t:(e.memoizedState=a,e=G1(),oe.lanes|=e,el|=e,a)}function a1(e,t,a,n){return Jt(a,t)?a:jr.current!==null?(e=vp(e,a,n),Jt(e,t)||(Ze=!0),e):(cn&42)===0||(cn&1073741824)!==0&&(de&261930)===0?(Ze=!0,e.memoizedState=a):(e=G1(),oe.lanes|=e,el|=e,t)}function n1(e,t,a,n,l){var r=be.p;be.p=r!==0&&8>r?r:8;var o=$.T,i={};$.T=i,Sp(e,!1,t,a);try{var u=l(),c=$.S;if(c!==null&&c(i,u),u!==null&&typeof u=="object"&&typeof u.then=="function"){var s=QS(u,n);Qo(e,t,s,Zt(e))}else Qo(e,t,n,Zt(e))}catch(f){Qo(e,t,{then:function(){},status:"rejected",reason:f},Zt())}finally{be.p=r,o!==null&&i.types!==null&&(o.types=i.types),$.T=o}}function $S(){}function Sd(e,t,a,n){if(e.tag!==5)throw Error(M(476));var l=l1(e).queue;n1(e,l,t,Sl,a===null?$S:function(){return r1(e),a(n)})}function l1(e){var t=e.memoizedState;if(t!==null)return t;t={memoizedState:Sl,baseState:Sl,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:fn,lastRenderedState:Sl},next:null};var a={};return t.next={memoizedState:a,baseState:a,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:fn,lastRenderedState:a},next:null},e.memoizedState=t,e=e.alternate,e!==null&&(e.memoizedState=t),t}function r1(e){var t=l1(e);t.next===null&&(t=e.alternate.memoizedState),Qo(e,t.next.queue,{},Zt())}function Cp(){return dt(ci)}function o1(){return Ve().memoizedState}function i1(){return Ve().memoizedState}function ek(e){for(var t=e.return;t!==null;){switch(t.tag){case 24:case 3:var a=Zt();e=Vn(a);var n=jn(t,e,a);n!==null&&(Ot(n,t,a),Vo(n,t,a)),t={cache:ip()},e.payload=t;return}t=t.return}}function tk(e,t,a){var n=Zt();a={lane:n,revertLane:0,gesture:null,action:a,hasEagerState:!1,eagerState:null,next:null},_s(e)?s1(t,a):(a=np(e,t,a,n),a!==null&&(Ot(a,e,n),c1(a,t,n)))}function u1(e,t,a){var n=Zt();Qo(e,t,a,n)}function Qo(e,t,a,n){var l={lane:n,revertLane:0,gesture:null,action:a,hasEagerState:!1,eagerState:null,next:null};if(_s(e))s1(t,l);else{var r=e.alternate;if(e.lanes===0&&(r===null||r.lanes===0)&&(r=t.lastRenderedReducer,r!==null))try{var o=t.lastRenderedState,i=r(o,a);if(l.hasEagerState=!0,l.eagerState=i,Jt(i,o))return qs(e,t,l,0),Te===null&&Ns(),!1}catch{}finally{}if(a=np(e,t,l,n),a!==null)return Ot(a,e,n),c1(a,t,n),!0}return!1}function Sp(e,t,a,n){if(n={lane:2,revertLane:zp(),gesture:null,action:n,hasEagerState:!1,eagerState:null,next:null},_s(e)){if(t)throw Error(M(479))}else t=np(e,a,n,2),t!==null&&Ot(t,e,2)}function _s(e){var t=e.alternate;return e===oe||t!==null&&t===oe}function s1(e,t){Fr=hs=!0;var a=e.pending;a===null?t.next=t:(t.next=a.next,a.next=t),e.pending=t}function c1(e,t,a){if((a&4194048)!==0){var n=t.lanes;n&=e.pendingLanes,a|=n,t.lanes=a,Kx(e,a)}}var ii={readContext:dt,use:Ps,useCallback:Ue,useContext:Ue,useEffect:Ue,useImperativeHandle:Ue,useLayoutEffect:Ue,useInsertionEffect:Ue,useMemo:Ue,useReducer:Ue,useRef:Ue,useState:Ue,useDebugValue:Ue,useDeferredValue:Ue,useTransition:Ue,useSyncExternalStore:Ue,useId:Ue,useHostTransitionStatus:Ue,useFormState:Ue,useActionState:Ue,useOptimistic:Ue,useMemoCache:Ue,useCacheRefresh:Ue};ii.useEffectEvent=Ue;var f1={readContext:dt,use:Ps,useCallback:function(e,t){return Tt().memoizedState=[e,t===void 0?null:t],e},useContext:dt,useEffect:Yg,useImperativeHandle:function(e,t,a){a=a!=null?a.concat([e]):null,Ku(4194308,4,Wy.bind(null,t,e),a)},useLayoutEffect:function(e,t){return Ku(4194308,4,e,t)},useInsertionEffect:function(e,t){Ku(4,2,e,t)},useMemo:function(e,t){var a=Tt();t=t===void 0?null:t;var n=e();if(El){qn(!0);try{e()}finally{qn(!1)}}return a.memoizedState=[n,t],n},useReducer:function(e,t,a){var n=Tt();if(a!==void 0){var l=a(t);if(El){qn(!0);try{a(t)}finally{qn(!1)}}}else l=t;return n.memoizedState=n.baseState=l,e={pending:null,lanes:0,dispatch:null,lastRenderedReducer:e,lastRenderedState:l},n.queue=e,e=e.dispatch=tk.bind(null,oe,e),[n.memoizedState,e]},useRef:function(e){var t=Tt();return e={current:e},t.memoizedState=e},useState:function(e){e=vd(e);var t=e.queue,a=u1.bind(null,oe,t);return t.dispatch=a,[e.memoizedState,a]},useDebugValue:Lp,useDeferredValue:function(e,t){var a=Tt();return vp(a,e,t)},useTransition:function(){var e=vd(!1);return e=n1.bind(null,oe,e.queue,!0,!1),Tt().memoizedState=e,[!1,e]},useSyncExternalStore:function(e,t,a){var n=oe,l=Tt();if(ge){if(a===void 0)throw Error(M(407));a=a()}else{if(a=t(),Te===null)throw Error(M(349));(de&127)!==0||Uy(n,t,a)}l.memoizedState=a;var r={value:a,getSnapshot:t};return l.queue=r,Yg(Py.bind(null,n,r,e),[e]),n.flags|=2048,Xr(9,{destroy:void 0},Fy.bind(null,n,r,a,t),null),a},useId:function(){var e=Tt(),t=Te.identifierPrefix;if(ge){var a=Ma,n=Da;a=(n&~(1<<32-Kt(n)-1)).toString(32)+a,t="_"+t+"R_"+a,a=gs++,0<a&&(t+="H"+a.toString(32)),t+="_"}else a=YS++,t="_"+t+"r_"+a.toString(32)+"_";return e.memoizedState=t},useHostTransitionStatus:Cp,useFormState:jg,useActionState:jg,useOptimistic:function(e){var t=Tt();t.memoizedState=t.baseState=e;var a={pending:null,lanes:0,dispatch:null,lastRenderedReducer:null,lastRenderedState:null};return t.queue=a,t=Sp.bind(null,oe,!0,a),a.dispatch=t,[e,t]},useMemoCache:xp,useCacheRefresh:function(){return Tt().memoizedState=ek.bind(null,oe)},useEffectEvent:function(e){var t=Tt(),a={impl:e};return t.memoizedState=a,function(){if((ye&2)!==0)throw Error(M(440));return a.impl.apply(void 0,arguments)}}},kp={readContext:dt,use:Ps,useCallback:e1,useContext:dt,useEffect:bp,useImperativeHandle:$y,useInsertionEffect:Zy,useLayoutEffect:Jy,useMemo:t1,useReducer:Yu,useRef:Yy,useState:function(){return Yu(fn)},useDebugValue:Lp,useDeferredValue:function(e,t){var a=Ve();return a1(a,Ie.memoizedState,e,t)},useTransition:function(){var e=Yu(fn)[0],t=Ve().memoizedState;return[typeof e=="boolean"?e:Li(e),t]},useSyncExternalStore:qy,useId:o1,useHostTransitionStatus:Cp,useFormState:Xg,useActionState:Xg,useOptimistic:function(e,t){var a=Ve();return Gy(a,Ie,e,t)},useMemoCache:xp,useCacheRefresh:i1};kp.useEffectEvent=Ky;var d1={readContext:dt,use:Ps,useCallback:e1,useContext:dt,useEffect:bp,useImperativeHandle:$y,useInsertionEffect:Zy,useLayoutEffect:Jy,useMemo:t1,useReducer:Ef,useRef:Yy,useState:function(){return Ef(fn)},useDebugValue:Lp,useDeferredValue:function(e,t){var a=Ve();return Ie===null?vp(a,e,t):a1(a,Ie.memoizedState,e,t)},useTransition:function(){var e=Ef(fn)[0],t=Ve().memoizedState;return[typeof e=="boolean"?e:Li(e),t]},useSyncExternalStore:qy,useId:o1,useHostTransitionStatus:Cp,useFormState:Qg,useActionState:Qg,useOptimistic:function(e,t){var a=Ve();return Ie!==null?Gy(a,Ie,e,t):(a.baseState=e,[e,a.queue.dispatch])},useMemoCache:xp,useCacheRefresh:i1};d1.useEffectEvent=Ky;function zf(e,t,a,n){t=e.memoizedState,a=a(n,t),a=a==null?t:Be({},t,a),e.memoizedState=a,e.lanes===0&&(e.updateQueue.baseState=a)}var kd={enqueueSetState:function(e,t,a){e=e._reactInternals;var n=Zt(),l=Vn(n);l.payload=t,a!=null&&(l.callback=a),t=jn(e,l,n),t!==null&&(Ot(t,e,n),Vo(t,e,n))},enqueueReplaceState:function(e,t,a){e=e._reactInternals;var n=Zt(),l=Vn(n);l.tag=1,l.payload=t,a!=null&&(l.callback=a),t=jn(e,l,n),t!==null&&(Ot(t,e,n),Vo(t,e,n))},enqueueForceUpdate:function(e,t){e=e._reactInternals;var a=Zt(),n=Vn(a);n.tag=2,t!=null&&(n.callback=t),t=jn(e,n,a),t!==null&&(Ot(t,e,a),Vo(t,e,a))}};function Kg(e,t,a,n,l,r,o){return e=e.stateNode,typeof e.shouldComponentUpdate=="function"?e.shouldComponentUpdate(n,r,o):t.prototype&&t.prototype.isPureReactComponent?!ai(a,n)||!ai(l,r):!0}function Zg(e,t,a,n){e=t.state,typeof t.componentWillReceiveProps=="function"&&t.componentWillReceiveProps(a,n),typeof t.UNSAFE_componentWillReceiveProps=="function"&&t.UNSAFE_componentWillReceiveProps(a,n),t.state!==e&&kd.enqueueReplaceState(t,t.state,null)}function zl(e,t){var a=t;if("ref"in t){a={};for(var n in t)n!=="ref"&&(a[n]=t[n])}if(e=e.defaultProps){a===t&&(a=Be({},a));for(var l in e)a[l]===void 0&&(a[l]=e[l])}return a}function p1(e){us(e)}function m1(e){console.error(e)}function h1(e){us(e)}function xs(e,t){try{var a=e.onUncaughtError;a(t.value,{componentStack:t.stack})}catch(n){setTimeout(function(){throw n})}}function Jg(e,t,a){try{var n=e.onCaughtError;n(a.value,{componentStack:a.stack,errorBoundary:t.tag===1?t.stateNode:null})}catch(l){setTimeout(function(){throw l})}}function wd(e,t,a){return a=Vn(a),a.tag=3,a.payload={element:null},a.callback=function(){xs(e,t)},a}function g1(e){return e=Vn(e),e.tag=3,e}function x1(e,t,a,n){var l=a.type.getDerivedStateFromError;if(typeof l=="function"){var r=n.value;e.payload=function(){return l(r)},e.callback=function(){Jg(t,a,n)}}var o=a.stateNode;o!==null&&typeof o.componentDidCatch=="function"&&(e.callback=function(){Jg(t,a,n),typeof l!="function"&&(Xn===null?Xn=new Set([this]):Xn.add(this));var i=n.stack;this.componentDidCatch(n.value,{componentStack:i!==null?i:""})})}function ak(e,t,a,n,l){if(a.flags|=32768,n!==null&&typeof n=="object"&&typeof n.then=="function"){if(t=a.alternate,t!==null&&eo(t,a,l,!0),a=Wt.current,a!==null){switch(a.tag){case 31:case 13:return ua===null?Cs():a.alternate===null&&Fe===0&&(Fe=3),a.flags&=-257,a.flags|=65536,a.lanes=l,n===ds?a.flags|=16384:(t=a.updateQueue,t===null?a.updateQueue=new Set([n]):t.add(n),Gf(e,n,l)),!1;case 22:return a.flags|=65536,n===ds?a.flags|=16384:(t=a.updateQueue,t===null?(t={transitions:null,markerInstances:null,retryQueue:new Set([n])},a.updateQueue=t):(a=t.retryQueue,a===null?t.retryQueue=new Set([n]):a.add(n)),Gf(e,n,l)),!1}throw Error(M(435,a.tag))}return Gf(e,n,l),Cs(),!1}if(ge)return t=Wt.current,t!==null?((t.flags&65536)===0&&(t.flags|=256),t.flags|=65536,t.lanes=l,n!==dd&&(e=Error(M(422),{cause:n}),li(oa(e,a)))):(n!==dd&&(t=Error(M(423),{cause:n}),li(oa(t,a))),e=e.current.alternate,e.flags|=65536,l&=-l,e.lanes|=l,n=oa(n,a),l=wd(e.stateNode,n,l),Mf(e,l),Fe!==4&&(Fe=2)),!1;var r=Error(M(520),{cause:n});if(r=oa(r,a),Zo===null?Zo=[r]:Zo.push(r),Fe!==4&&(Fe=2),t===null)return!0;n=oa(n,a),a=t;do{switch(a.tag){case 3:return a.flags|=65536,e=l&-l,a.lanes|=e,e=wd(a.stateNode,n,e),Mf(a,e),!1;case 1:if(t=a.type,r=a.stateNode,(a.flags&128)===0&&(typeof t.getDerivedStateFromError=="function"||r!==null&&typeof r.componentDidCatch=="function"&&(Xn===null||!Xn.has(r))))return a.flags|=65536,l&=-l,a.lanes|=l,l=g1(l),x1(l,e,a,n),Mf(a,l),!1}a=a.return}while(a!==null);return!1}var wp=Error(M(461)),Ze=!1;function st(e,t,a,n){t.child=e===null?Ey(t,null,a,n):Ml(t,e.child,a,n)}function Wg(e,t,a,n,l){a=a.render;var r=t.ref;if("ref"in n){var o={};for(var i in n)i!=="ref"&&(o[i]=n[i])}else o=n;return Dl(t),n=pp(e,t,a,o,r,l),i=mp(),e!==null&&!Ze?(hp(e,t,l),dn(e,t,l)):(ge&&i&&rp(t),t.flags|=1,st(e,t,n,l),t.child)}function $g(e,t,a,n,l){if(e===null){var r=a.type;return typeof r=="function"&&!lp(r)&&r.defaultProps===void 0&&a.compare===null?(t.tag=15,t.type=r,y1(e,t,r,n,l)):(e=Xu(a.type,null,n,t,t.mode,l),e.ref=t.ref,e.return=t,t.child=e)}if(r=e.child,!Ip(e,l)){var o=r.memoizedProps;if(a=a.compare,a=a!==null?a:ai,a(o,n)&&e.ref===t.ref)return dn(e,t,l)}return t.flags|=1,e=rn(r,n),e.ref=t.ref,e.return=t,t.child=e}function y1(e,t,a,n,l){if(e!==null){var r=e.memoizedProps;if(ai(r,n)&&e.ref===t.ref)if(Ze=!1,t.pendingProps=n=r,Ip(e,l))(e.flags&131072)!==0&&(Ze=!0);else return t.lanes=e.lanes,dn(e,t,l)}return Id(e,t,a,n,l)}function b1(e,t,a,n){var l=n.children,r=e!==null?e.memoizedState:null;if(e===null&&t.stateNode===null&&(t.stateNode={_visibility:1,_pendingMarkers:null,_retryCache:null,_transitions:null}),n.mode==="hidden"){if((t.flags&128)!==0){if(r=r!==null?r.baseLanes|a:a,e!==null){for(n=t.child=e.child,l=0;n!==null;)l=l|n.lanes|n.childLanes,n=n.sibling;n=l&~r}else n=0,t.child=null;return ex(e,t,r,a,n)}if((a&536870912)!==0)t.memoizedState={baseLanes:0,cachePool:null},e!==null&&Qu(t,r!==null?r.cachePool:null),r!==null?_g(t,r):bd(),Ry(t);else return n=t.lanes=536870912,ex(e,t,r!==null?r.baseLanes|a:a,a,n)}else r!==null?(Qu(t,r.cachePool),_g(t,r),On(t),t.memoizedState=null):(e!==null&&Qu(t,null),bd(),On(t));return st(e,t,l,a),t.child}function Uo(e,t){return e!==null&&e.tag===22||t.stateNode!==null||(t.stateNode={_visibility:1,_pendingMarkers:null,_retryCache:null,_transitions:null}),t.sibling}function ex(e,t,a,n,l){var r=up();return r=r===null?null:{parent:Ke._currentValue,pool:r},t.memoizedState={baseLanes:a,cachePool:r},e!==null&&Qu(t,null),bd(),Ry(t),e!==null&&eo(e,t,n,!0),t.childLanes=l,null}function Zu(e,t){return t=ys({mode:t.mode,children:t.children},e.mode),t.ref=e.ref,e.child=t,t.return=e,t}function tx(e,t,a){return Ml(t,e.child,null,a),e=Zu(t,t.pendingProps),e.flags|=2,Vt(t),t.memoizedState=null,e}function nk(e,t,a){var n=t.pendingProps,l=(t.flags&128)!==0;if(t.flags&=-129,e===null){if(ge){if(n.mode==="hidden")return e=Zu(t,n),t.lanes=536870912,Uo(null,e);if(Ld(t),(e=ze)?(e=fb(e,ia),e=e!==null&&e.data==="&"?e:null,e!==null&&(t.memoizedState={dehydrated:e,treeContext:Jn!==null?{id:Da,overflow:Ma}:null,retryLane:536870912,hydrationErrors:null},a=ky(e),a.return=t,t.child=a,ft=t,ze=null)):e=null,e===null)throw Wn(t);return t.lanes=536870912,null}return Zu(t,n)}var r=e.memoizedState;if(r!==null){var o=r.dehydrated;if(Ld(t),l)if(t.flags&256)t.flags&=-257,t=tx(e,t,a);else if(t.memoizedState!==null)t.child=e.child,t.flags|=128,t=null;else throw Error(M(558));else if(Ze||eo(e,t,a,!1),l=(a&e.childLanes)!==0,Ze||l){if(n=Te,n!==null&&(o=Zx(n,a),o!==0&&o!==r.retryLane))throw r.retryLane=o,Nl(e,o),Ot(n,e,o),wp;Cs(),t=tx(e,t,a)}else e=r.treeContext,ze=sa(o.nextSibling),ft=t,ge=!0,Gn=null,ia=!1,e!==null&&Iy(t,e),t=Zu(t,n),t.flags|=4096;return t}return e=rn(e.child,{mode:n.mode,children:n.children}),e.ref=t.ref,t.child=e,e.return=t,e}function Ju(e,t){var a=t.ref;if(a===null)e!==null&&e.ref!==null&&(t.flags|=4194816);else{if(typeof a!="function"&&typeof a!="object")throw Error(M(284));(e===null||e.ref!==a)&&(t.flags|=4194816)}}function Id(e,t,a,n,l){return Dl(t),a=pp(e,t,a,n,void 0,l),n=mp(),e!==null&&!Ze?(hp(e,t,l),dn(e,t,l)):(ge&&n&&rp(t),t.flags|=1,st(e,t,a,l),t.child)}function ax(e,t,a,n,l,r){return Dl(t),t.updateQueue=null,a=Ny(t,n,a,l),Oy(e),n=mp(),e!==null&&!Ze?(hp(e,t,r),dn(e,t,r)):(ge&&n&&rp(t),t.flags|=1,st(e,t,a,r),t.child)}function nx(e,t,a,n,l){if(Dl(t),t.stateNode===null){var r=Mr,o=a.contextType;typeof o=="object"&&o!==null&&(r=dt(o)),r=new a(n,r),t.memoizedState=r.state!==null&&r.state!==void 0?r.state:null,r.updater=kd,t.stateNode=r,r._reactInternals=t,r=t.stateNode,r.props=n,r.state=t.memoizedState,r.refs={},cp(t),o=a.contextType,r.context=typeof o=="object"&&o!==null?dt(o):Mr,r.state=t.memoizedState,o=a.getDerivedStateFromProps,typeof o=="function"&&(zf(t,a,o,n),r.state=t.memoizedState),typeof a.getDerivedStateFromProps=="function"||typeof r.getSnapshotBeforeUpdate=="function"||typeof r.UNSAFE_componentWillMount!="function"&&typeof r.componentWillMount!="function"||(o=r.state,typeof r.componentWillMount=="function"&&r.componentWillMount(),typeof r.UNSAFE_componentWillMount=="function"&&r.UNSAFE_componentWillMount(),o!==r.state&&kd.enqueueReplaceState(r,r.state,null),Xo(t,n,r,l),jo(),r.state=t.memoizedState),typeof r.componentDidMount=="function"&&(t.flags|=4194308),n=!0}else if(e===null){r=t.stateNode;var i=t.memoizedProps,u=zl(a,i);r.props=u;var c=r.context,s=a.contextType;o=Mr,typeof s=="object"&&s!==null&&(o=dt(s));var f=a.getDerivedStateFromProps;s=typeof f=="function"||typeof r.getSnapshotBeforeUpdate=="function",i=t.pendingProps!==i,s||typeof r.UNSAFE_componentWillReceiveProps!="function"&&typeof r.componentWillReceiveProps!="function"||(i||c!==o)&&Zg(t,r,n,o),zn=!1;var p=t.memoizedState;r.state=p,Xo(t,n,r,l),jo(),c=t.memoizedState,i||p!==c||zn?(typeof f=="function"&&(zf(t,a,f,n),c=t.memoizedState),(u=zn||Kg(t,a,u,n,p,c,o))?(s||typeof r.UNSAFE_componentWillMount!="function"&&typeof r.componentWillMount!="function"||(typeof r.componentWillMount=="function"&&r.componentWillMount(),typeof r.UNSAFE_componentWillMount=="function"&&r.UNSAFE_componentWillMount()),typeof r.componentDidMount=="function"&&(t.flags|=4194308)):(typeof r.componentDidMount=="function"&&(t.flags|=4194308),t.memoizedProps=n,t.memoizedState=c),r.props=n,r.state=c,r.context=o,n=u):(typeof r.componentDidMount=="function"&&(t.flags|=4194308),n=!1)}else{r=t.stateNode,xd(e,t),o=t.memoizedProps,s=zl(a,o),r.props=s,f=t.pendingProps,p=r.context,c=a.contextType,u=Mr,typeof c=="object"&&c!==null&&(u=dt(c)),i=a.getDerivedStateFromProps,(c=typeof i=="function"||typeof r.getSnapshotBeforeUpdate=="function")||typeof r.UNSAFE_componentWillReceiveProps!="function"&&typeof r.componentWillReceiveProps!="function"||(o!==f||p!==u)&&Zg(t,r,n,u),zn=!1,p=t.memoizedState,r.state=p,Xo(t,n,r,l),jo();var d=t.memoizedState;o!==f||p!==d||zn||e!==null&&e.dependencies!==null&&fs(e.dependencies)?(typeof i=="function"&&(zf(t,a,i,n),d=t.memoizedState),(s=zn||Kg(t,a,s,n,p,d,u)||e!==null&&e.dependencies!==null&&fs(e.dependencies))?(c||typeof r.UNSAFE_componentWillUpdate!="function"&&typeof r.componentWillUpdate!="function"||(typeof r.componentWillUpdate=="function"&&r.componentWillUpdate(n,d,u),typeof r.UNSAFE_componentWillUpdate=="function"&&r.UNSAFE_componentWillUpdate(n,d,u)),typeof r.componentDidUpdate=="function"&&(t.flags|=4),typeof r.getSnapshotBeforeUpdate=="function"&&(t.flags|=1024)):(typeof r.componentDidUpdate!="function"||o===e.memoizedProps&&p===e.memoizedState||(t.flags|=4),typeof r.getSnapshotBeforeUpdate!="function"||o===e.memoizedProps&&p===e.memoizedState||(t.flags|=1024),t.memoizedProps=n,t.memoizedState=d),r.props=n,r.state=d,r.context=u,n=s):(typeof r.componentDidUpdate!="function"||o===e.memoizedProps&&p===e.memoizedState||(t.flags|=4),typeof r.getSnapshotBeforeUpdate!="function"||o===e.memoizedProps&&p===e.memoizedState||(t.flags|=1024),n=!1)}return r=n,Ju(e,t),n=(t.flags&128)!==0,r||n?(r=t.stateNode,a=n&&typeof a.getDerivedStateFromError!="function"?null:r.render(),t.flags|=1,e!==null&&n?(t.child=Ml(t,e.child,null,l),t.child=Ml(t,null,a,l)):st(e,t,a,l),t.memoizedState=r.state,e=t.child):e=dn(e,t,l),e}function lx(e,t,a,n){return Tl(),t.flags|=256,st(e,t,a,n),t.child}var Bf={dehydrated:null,treeContext:null,retryLane:0,hydrationErrors:null};function Rf(e){return{baseLanes:e,cachePool:Ty()}}function Of(e,t,a){return e=e!==null?e.childLanes&~a:0,t&&(e|=Xt),e}function L1(e,t,a){var n=t.pendingProps,l=!1,r=(t.flags&128)!==0,o;if((o=r)||(o=e!==null&&e.memoizedState===null?!1:(Ge.current&2)!==0),o&&(l=!0,t.flags&=-129),o=(t.flags&32)!==0,t.flags&=-33,e===null){if(ge){if(l?Rn(t):On(t),(e=ze)?(e=fb(e,ia),e=e!==null&&e.data!=="&"?e:null,e!==null&&(t.memoizedState={dehydrated:e,treeContext:Jn!==null?{id:Da,overflow:Ma}:null,retryLane:536870912,hydrationErrors:null},a=ky(e),a.return=t,t.child=a,ft=t,ze=null)):e=null,e===null)throw Wn(t);return Pd(e)?t.lanes=32:t.lanes=536870912,null}var i=n.children;return n=n.fallback,l?(On(t),l=t.mode,i=ys({mode:"hidden",children:i},l),n=kl(n,l,a,null),i.return=t,n.return=t,i.sibling=n,t.child=i,n=t.child,n.memoizedState=Rf(a),n.childLanes=Of(e,o,a),t.memoizedState=Bf,Uo(null,n)):(Rn(t),Ad(t,i))}var u=e.memoizedState;if(u!==null&&(i=u.dehydrated,i!==null)){if(r)t.flags&256?(Rn(t),t.flags&=-257,t=Nf(e,t,a)):t.memoizedState!==null?(On(t),t.child=e.child,t.flags|=128,t=null):(On(t),i=n.fallback,l=t.mode,n=ys({mode:"visible",children:n.children},l),i=kl(i,l,a,null),i.flags|=2,n.return=t,i.return=t,n.sibling=i,t.child=n,Ml(t,e.child,null,a),n=t.child,n.memoizedState=Rf(a),n.childLanes=Of(e,o,a),t.memoizedState=Bf,t=Uo(null,n));else if(Rn(t),Pd(i)){if(o=i.nextSibling&&i.nextSibling.dataset,o)var c=o.dgst;o=c,n=Error(M(419)),n.stack="",n.digest=o,li({value:n,source:null,stack:null}),t=Nf(e,t,a)}else if(Ze||eo(e,t,a,!1),o=(a&e.childLanes)!==0,Ze||o){if(o=Te,o!==null&&(n=Zx(o,a),n!==0&&n!==u.retryLane))throw u.retryLane=n,Nl(e,n),Ot(o,e,n),wp;Fd(i)||Cs(),t=Nf(e,t,a)}else Fd(i)?(t.flags|=192,t.child=e.child,t=null):(e=u.treeContext,ze=sa(i.nextSibling),ft=t,ge=!0,Gn=null,ia=!1,e!==null&&Iy(t,e),t=Ad(t,n.children),t.flags|=4096);return t}return l?(On(t),i=n.fallback,l=t.mode,u=e.child,c=u.sibling,n=rn(u,{mode:"hidden",children:n.children}),n.subtreeFlags=u.subtreeFlags&65011712,c!==null?i=rn(c,i):(i=kl(i,l,a,null),i.flags|=2),i.return=t,n.return=t,n.sibling=i,t.child=n,Uo(null,n),n=t.child,i=e.child.memoizedState,i===null?i=Rf(a):(l=i.cachePool,l!==null?(u=Ke._currentValue,l=l.parent!==u?{parent:u,pool:u}:l):l=Ty(),i={baseLanes:i.baseLanes|a,cachePool:l}),n.memoizedState=i,n.childLanes=Of(e,o,a),t.memoizedState=Bf,Uo(e.child,n)):(Rn(t),a=e.child,e=a.sibling,a=rn(a,{mode:"visible",children:n.children}),a.return=t,a.sibling=null,e!==null&&(o=t.deletions,o===null?(t.deletions=[e],t.flags|=16):o.push(e)),t.child=a,t.memoizedState=null,a)}function Ad(e,t){return t=ys({mode:"visible",children:t},e.mode),t.return=e,e.child=t}function ys(e,t){return e=jt(22,e,null,t),e.lanes=0,e}function Nf(e,t,a){return Ml(t,e.child,null,a),e=Ad(t,t.pendingProps.children),e.flags|=2,t.memoizedState=null,e}function rx(e,t,a){e.lanes|=t;var n=e.alternate;n!==null&&(n.lanes|=t),md(e.return,t,a)}function qf(e,t,a,n,l,r){var o=e.memoizedState;o===null?e.memoizedState={isBackwards:t,rendering:null,renderingStartTime:0,last:n,tail:a,tailMode:l,treeForkCount:r}:(o.isBackwards=t,o.rendering=null,o.renderingStartTime=0,o.last=n,o.tail=a,o.tailMode=l,o.treeForkCount=r)}function v1(e,t,a){var n=t.pendingProps,l=n.revealOrder,r=n.tail;n=n.children;var o=Ge.current,i=(o&2)!==0;if(i?(o=o&1|2,t.flags|=128):o&=1,De(Ge,o),st(e,t,n,a),n=ge?ni:0,!i&&e!==null&&(e.flags&128)!==0)e:for(e=t.child;e!==null;){if(e.tag===13)e.memoizedState!==null&&rx(e,a,t);else if(e.tag===19)rx(e,a,t);else if(e.child!==null){e.child.return=e,e=e.child;continue}if(e===t)break e;for(;e.sibling===null;){if(e.return===null||e.return===t)break e;e=e.return}e.sibling.return=e.return,e=e.sibling}switch(l){case"forwards":for(a=t.child,l=null;a!==null;)e=a.alternate,e!==null&&ms(e)===null&&(l=a),a=a.sibling;a=l,a===null?(l=t.child,t.child=null):(l=a.sibling,a.sibling=null),qf(t,!1,l,a,r,n);break;case"backwards":case"unstable_legacy-backwards":for(a=null,l=t.child,t.child=null;l!==null;){if(e=l.alternate,e!==null&&ms(e)===null){t.child=l;break}e=l.sibling,l.sibling=a,a=l,l=e}qf(t,!0,a,null,r,n);break;case"together":qf(t,!1,null,null,void 0,n);break;default:t.memoizedState=null}return t.child}function dn(e,t,a){if(e!==null&&(t.dependencies=e.dependencies),el|=t.lanes,(a&t.childLanes)===0)if(e!==null){if(eo(e,t,a,!1),(a&t.childLanes)===0)return null}else return null;if(e!==null&&t.child!==e.child)throw Error(M(153));if(t.child!==null){for(e=t.child,a=rn(e,e.pendingProps),t.child=a,a.return=t;e.sibling!==null;)e=e.sibling,a=a.sibling=rn(e,e.pendingProps),a.return=t;a.sibling=null}return t.child}function Ip(e,t){return(e.lanes&t)!==0?!0:(e=e.dependencies,!!(e!==null&&fs(e)))}function lk(e,t,a){switch(t.tag){case 3:ls(t,t.stateNode.containerInfo),Bn(t,Ke,e.memoizedState.cache),Tl();break;case 27:case 5:td(t);break;case 4:ls(t,t.stateNode.containerInfo);break;case 10:Bn(t,t.type,t.memoizedProps.value);break;case 31:if(t.memoizedState!==null)return t.flags|=128,Ld(t),null;break;case 13:var n=t.memoizedState;if(n!==null)return n.dehydrated!==null?(Rn(t),t.flags|=128,null):(a&t.child.childLanes)!==0?L1(e,t,a):(Rn(t),e=dn(e,t,a),e!==null?e.sibling:null);Rn(t);break;case 19:var l=(e.flags&128)!==0;if(n=(a&t.childLanes)!==0,n||(eo(e,t,a,!1),n=(a&t.childLanes)!==0),l){if(n)return v1(e,t,a);t.flags|=128}if(l=t.memoizedState,l!==null&&(l.rendering=null,l.tail=null,l.lastEffect=null),De(Ge,Ge.current),n)break;return null;case 22:return t.lanes=0,b1(e,t,a,t.pendingProps);case 24:Bn(t,Ke,e.memoizedState.cache)}return dn(e,t,a)}function C1(e,t,a){if(e!==null)if(e.memoizedProps!==t.pendingProps)Ze=!0;else{if(!Ip(e,a)&&(t.flags&128)===0)return Ze=!1,lk(e,t,a);Ze=(e.flags&131072)!==0}else Ze=!1,ge&&(t.flags&1048576)!==0&&wy(t,ni,t.index);switch(t.lanes=0,t.tag){case 16:e:{var n=t.pendingProps;if(e=vl(t.elementType),t.type=e,typeof e=="function")lp(e)?(n=zl(e,n),t.tag=1,t=nx(null,t,e,n,a)):(t.tag=0,t=Id(null,t,e,n,a));else{if(e!=null){var l=e.$$typeof;if(l===Vd){t.tag=11,t=Wg(null,t,e,n,a);break e}else if(l===jd){t.tag=14,t=$g(null,t,e,n,a);break e}}throw t=$f(e)||e,Error(M(306,t,""))}}return t;case 0:return Id(e,t,t.type,t.pendingProps,a);case 1:return n=t.type,l=zl(n,t.pendingProps),nx(e,t,n,l,a);case 3:e:{if(ls(t,t.stateNode.containerInfo),e===null)throw Error(M(387));n=t.pendingProps;var r=t.memoizedState;l=r.element,xd(e,t),Xo(t,n,null,a);var o=t.memoizedState;if(n=o.cache,Bn(t,Ke,n),n!==r.cache&&hd(t,[Ke],a,!0),jo(),n=o.element,r.isDehydrated)if(r={element:n,isDehydrated:!1,cache:o.cache},t.updateQueue.baseState=r,t.memoizedState=r,t.flags&256){t=lx(e,t,n,a);break e}else if(n!==l){l=oa(Error(M(424)),t),li(l),t=lx(e,t,n,a);break e}else{switch(e=t.stateNode.containerInfo,e.nodeType){case 9:e=e.body;break;default:e=e.nodeName==="HTML"?e.ownerDocument.body:e}for(ze=sa(e.firstChild),ft=t,ge=!0,Gn=null,ia=!0,a=Ey(t,null,n,a),t.child=a;a;)a.flags=a.flags&-3|4096,a=a.sibling}else{if(Tl(),n===l){t=dn(e,t,a);break e}st(e,t,n,a)}t=t.child}return t;case 26:return Ju(e,t),e===null?(a=Ax(t.type,null,t.pendingProps,null))?t.memoizedState=a:ge||(a=t.type,e=t.pendingProps,n=Is(_n.current).createElement(a),n[ct]=t,n[Nt]=e,pt(n,a,e),nt(n),t.stateNode=n):t.memoizedState=Ax(t.type,e.memoizedProps,t.pendingProps,e.memoizedState),null;case 27:return td(t),e===null&&ge&&(n=t.stateNode=db(t.type,t.pendingProps,_n.current),ft=t,ia=!0,l=ze,al(t.type)?(Hd=l,ze=sa(n.firstChild)):ze=l),st(e,t,t.pendingProps.children,a),Ju(e,t),e===null&&(t.flags|=4194304),t.child;case 5:return e===null&&ge&&((l=n=ze)&&(n=zk(n,t.type,t.pendingProps,ia),n!==null?(t.stateNode=n,ft=t,ze=sa(n.firstChild),ia=!1,l=!0):l=!1),l||Wn(t)),td(t),l=t.type,r=t.pendingProps,o=e!==null?e.memoizedProps:null,n=r.children,qd(l,r)?n=null:o!==null&&qd(l,o)&&(t.flags|=32),t.memoizedState!==null&&(l=pp(e,t,KS,null,null,a),ci._currentValue=l),Ju(e,t),st(e,t,n,a),t.child;case 6:return e===null&&ge&&((e=a=ze)&&(a=Bk(a,t.pendingProps,ia),a!==null?(t.stateNode=a,ft=t,ze=null,e=!0):e=!1),e||Wn(t)),null;case 13:return L1(e,t,a);case 4:return ls(t,t.stateNode.containerInfo),n=t.pendingProps,e===null?t.child=Ml(t,null,n,a):st(e,t,n,a),t.child;case 11:return Wg(e,t,t.type,t.pendingProps,a);case 7:return st(e,t,t.pendingProps,a),t.child;case 8:return st(e,t,t.pendingProps.children,a),t.child;case 12:return st(e,t,t.pendingProps.children,a),t.child;case 10:return n=t.pendingProps,Bn(t,t.type,n.value),st(e,t,n.children,a),t.child;case 9:return l=t.type._context,n=t.pendingProps.children,Dl(t),l=dt(l),n=n(l),t.flags|=1,st(e,t,n,a),t.child;case 14:return $g(e,t,t.type,t.pendingProps,a);case 15:return y1(e,t,t.type,t.pendingProps,a);case 19:return v1(e,t,a);case 31:return nk(e,t,a);case 22:return b1(e,t,a,t.pendingProps);case 24:return Dl(t),n=dt(Ke),e===null?(l=up(),l===null&&(l=Te,r=ip(),l.pooledCache=r,r.refCount++,r!==null&&(l.pooledCacheLanes|=a),l=r),t.memoizedState={parent:n,cache:l},cp(t),Bn(t,Ke,l)):((e.lanes&a)!==0&&(xd(e,t),Xo(t,null,null,a),jo()),l=e.memoizedState,r=t.memoizedState,l.parent!==n?(l={parent:n,cache:n},t.memoizedState=l,t.lanes===0&&(t.memoizedState=t.updateQueue.baseState=l),Bn(t,Ke,n)):(n=r.cache,Bn(t,Ke,n),n!==l.cache&&hd(t,[Ke],a,!0))),st(e,t,t.pendingProps.children,a),t.child;case 29:throw t.pendingProps}throw Error(M(156,t.tag))}function Za(e){e.flags|=4}function Uf(e,t,a,n,l){if((t=(e.mode&32)!==0)&&(t=!1),t){if(e.flags|=16777216,(l&335544128)===l)if(e.stateNode.complete)e.flags|=8192;else if(X1())e.flags|=8192;else throw Il=ds,sp}else e.flags&=-16777217}function ox(e,t){if(t.type!=="stylesheet"||(t.state.loading&4)!==0)e.flags&=-16777217;else if(e.flags|=16777216,!hb(t))if(X1())e.flags|=8192;else throw Il=ds,sp}function Ou(e,t){t!==null&&(e.flags|=4),e.flags&16384&&(t=e.tag!==22?Qx():536870912,e.lanes|=t,Qr|=t)}function Eo(e,t){if(!ge)switch(e.tailMode){case"hidden":t=e.tail;for(var a=null;t!==null;)t.alternate!==null&&(a=t),t=t.sibling;a===null?e.tail=null:a.sibling=null;break;case"collapsed":a=e.tail;for(var n=null;a!==null;)a.alternate!==null&&(n=a),a=a.sibling;n===null?t||e.tail===null?e.tail=null:e.tail.sibling=null:n.sibling=null}}function Ee(e){var t=e.alternate!==null&&e.alternate.child===e.child,a=0,n=0;if(t)for(var l=e.child;l!==null;)a|=l.lanes|l.childLanes,n|=l.subtreeFlags&65011712,n|=l.flags&65011712,l.return=e,l=l.sibling;else for(l=e.child;l!==null;)a|=l.lanes|l.childLanes,n|=l.subtreeFlags,n|=l.flags,l.return=e,l=l.sibling;return e.subtreeFlags|=n,e.childLanes=a,t}function rk(e,t,a){var n=t.pendingProps;switch(op(t),t.tag){case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return Ee(t),null;case 1:return Ee(t),null;case 3:return a=t.stateNode,n=null,e!==null&&(n=e.memoizedState.cache),t.memoizedState.cache!==n&&(t.flags|=2048),on(Ke),Hr(),a.pendingContext&&(a.context=a.pendingContext,a.pendingContext=null),(e===null||e.child===null)&&(yr(t)?Za(t):e===null||e.memoizedState.isDehydrated&&(t.flags&256)===0||(t.flags|=1024,Df())),Ee(t),null;case 26:var l=t.type,r=t.memoizedState;return e===null?(Za(t),r!==null?(Ee(t),ox(t,r)):(Ee(t),Uf(t,l,null,n,a))):r?r!==e.memoizedState?(Za(t),Ee(t),ox(t,r)):(Ee(t),t.flags&=-16777217):(e=e.memoizedProps,e!==n&&Za(t),Ee(t),Uf(t,l,e,n,a)),null;case 27:if(rs(t),a=_n.current,l=t.type,e!==null&&t.stateNode!=null)e.memoizedProps!==n&&Za(t);else{if(!n){if(t.stateNode===null)throw Error(M(166));return Ee(t),null}e=za.current,yr(t)?Og(t,e):(e=db(l,n,a),t.stateNode=e,Za(t))}return Ee(t),null;case 5:if(rs(t),l=t.type,e!==null&&t.stateNode!=null)e.memoizedProps!==n&&Za(t);else{if(!n){if(t.stateNode===null)throw Error(M(166));return Ee(t),null}if(r=za.current,yr(t))Og(t,r);else{var o=Is(_n.current);switch(r){case 1:r=o.createElementNS("http://www.w3.org/2000/svg",l);break;case 2:r=o.createElementNS("http://www.w3.org/1998/Math/MathML",l);break;default:switch(l){case"svg":r=o.createElementNS("http://www.w3.org/2000/svg",l);break;case"math":r=o.createElementNS("http://www.w3.org/1998/Math/MathML",l);break;case"script":r=o.createElement("div"),r.innerHTML="<script><\/script>",r=r.removeChild(r.firstChild);break;case"select":r=typeof n.is=="string"?o.createElement("select",{is:n.is}):o.createElement("select"),n.multiple?r.multiple=!0:n.size&&(r.size=n.size);break;default:r=typeof n.is=="string"?o.createElement(l,{is:n.is}):o.createElement(l)}}r[ct]=t,r[Nt]=n;e:for(o=t.child;o!==null;){if(o.tag===5||o.tag===6)r.appendChild(o.stateNode);else if(o.tag!==4&&o.tag!==27&&o.child!==null){o.child.return=o,o=o.child;continue}if(o===t)break e;for(;o.sibling===null;){if(o.return===null||o.return===t)break e;o=o.return}o.sibling.return=o.return,o=o.sibling}t.stateNode=r;e:switch(pt(r,l,n),l){case"button":case"input":case"select":case"textarea":n=!!n.autoFocus;break e;case"img":n=!0;break e;default:n=!1}n&&Za(t)}}return Ee(t),Uf(t,t.type,e===null?null:e.memoizedProps,t.pendingProps,a),null;case 6:if(e&&t.stateNode!=null)e.memoizedProps!==n&&Za(t);else{if(typeof n!="string"&&t.stateNode===null)throw Error(M(166));if(e=_n.current,yr(t)){if(e=t.stateNode,a=t.memoizedProps,n=null,l=ft,l!==null)switch(l.tag){case 27:case 5:n=l.memoizedProps}e[ct]=t,e=!!(e.nodeValue===a||n!==null&&n.suppressHydrationWarning===!0||ub(e.nodeValue,a)),e||Wn(t,!0)}else e=Is(e).createTextNode(n),e[ct]=t,t.stateNode=e}return Ee(t),null;case 31:if(a=t.memoizedState,e===null||e.memoizedState!==null){if(n=yr(t),a!==null){if(e===null){if(!n)throw Error(M(318));if(e=t.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(M(557));e[ct]=t}else Tl(),(t.flags&128)===0&&(t.memoizedState=null),t.flags|=4;Ee(t),e=!1}else a=Df(),e!==null&&e.memoizedState!==null&&(e.memoizedState.hydrationErrors=a),e=!0;if(!e)return t.flags&256?(Vt(t),t):(Vt(t),null);if((t.flags&128)!==0)throw Error(M(558))}return Ee(t),null;case 13:if(n=t.memoizedState,e===null||e.memoizedState!==null&&e.memoizedState.dehydrated!==null){if(l=yr(t),n!==null&&n.dehydrated!==null){if(e===null){if(!l)throw Error(M(318));if(l=t.memoizedState,l=l!==null?l.dehydrated:null,!l)throw Error(M(317));l[ct]=t}else Tl(),(t.flags&128)===0&&(t.memoizedState=null),t.flags|=4;Ee(t),l=!1}else l=Df(),e!==null&&e.memoizedState!==null&&(e.memoizedState.hydrationErrors=l),l=!0;if(!l)return t.flags&256?(Vt(t),t):(Vt(t),null)}return Vt(t),(t.flags&128)!==0?(t.lanes=a,t):(a=n!==null,e=e!==null&&e.memoizedState!==null,a&&(n=t.child,l=null,n.alternate!==null&&n.alternate.memoizedState!==null&&n.alternate.memoizedState.cachePool!==null&&(l=n.alternate.memoizedState.cachePool.pool),r=null,n.memoizedState!==null&&n.memoizedState.cachePool!==null&&(r=n.memoizedState.cachePool.pool),r!==l&&(n.flags|=2048)),a!==e&&a&&(t.child.flags|=8192),Ou(t,t.updateQueue),Ee(t),null);case 4:return Hr(),e===null&&Bp(t.stateNode.containerInfo),Ee(t),null;case 10:return on(t.type),Ee(t),null;case 19:if(lt(Ge),n=t.memoizedState,n===null)return Ee(t),null;if(l=(t.flags&128)!==0,r=n.rendering,r===null)if(l)Eo(n,!1);else{if(Fe!==0||e!==null&&(e.flags&128)!==0)for(e=t.child;e!==null;){if(r=ms(e),r!==null){for(t.flags|=128,Eo(n,!1),e=r.updateQueue,t.updateQueue=e,Ou(t,e),t.subtreeFlags=0,e=a,a=t.child;a!==null;)Sy(a,e),a=a.sibling;return De(Ge,Ge.current&1|2),ge&&en(t,n.treeForkCount),t.child}e=e.sibling}n.tail!==null&&Qt()>Ls&&(t.flags|=128,l=!0,Eo(n,!1),t.lanes=4194304)}else{if(!l)if(e=ms(r),e!==null){if(t.flags|=128,l=!0,e=e.updateQueue,t.updateQueue=e,Ou(t,e),Eo(n,!0),n.tail===null&&n.tailMode==="hidden"&&!r.alternate&&!ge)return Ee(t),null}else 2*Qt()-n.renderingStartTime>Ls&&a!==536870912&&(t.flags|=128,l=!0,Eo(n,!1),t.lanes=4194304);n.isBackwards?(r.sibling=t.child,t.child=r):(e=n.last,e!==null?e.sibling=r:t.child=r,n.last=r)}return n.tail!==null?(e=n.tail,n.rendering=e,n.tail=e.sibling,n.renderingStartTime=Qt(),e.sibling=null,a=Ge.current,De(Ge,l?a&1|2:a&1),ge&&en(t,n.treeForkCount),e):(Ee(t),null);case 22:case 23:return Vt(t),fp(),n=t.memoizedState!==null,e!==null?e.memoizedState!==null!==n&&(t.flags|=8192):n&&(t.flags|=8192),n?(a&536870912)!==0&&(t.flags&128)===0&&(Ee(t),t.subtreeFlags&6&&(t.flags|=8192)):Ee(t),a=t.updateQueue,a!==null&&Ou(t,a.retryQueue),a=null,e!==null&&e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(a=e.memoizedState.cachePool.pool),n=null,t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(n=t.memoizedState.cachePool.pool),n!==a&&(t.flags|=2048),e!==null&&lt(wl),null;case 24:return a=null,e!==null&&(a=e.memoizedState.cache),t.memoizedState.cache!==a&&(t.flags|=2048),on(Ke),Ee(t),null;case 25:return null;case 30:return null}throw Error(M(156,t.tag))}function ok(e,t){switch(op(t),t.tag){case 1:return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 3:return on(Ke),Hr(),e=t.flags,(e&65536)!==0&&(e&128)===0?(t.flags=e&-65537|128,t):null;case 26:case 27:case 5:return rs(t),null;case 31:if(t.memoizedState!==null){if(Vt(t),t.alternate===null)throw Error(M(340));Tl()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 13:if(Vt(t),e=t.memoizedState,e!==null&&e.dehydrated!==null){if(t.alternate===null)throw Error(M(340));Tl()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 19:return lt(Ge),null;case 4:return Hr(),null;case 10:return on(t.type),null;case 22:case 23:return Vt(t),fp(),e!==null&&lt(wl),e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 24:return on(Ke),null;case 25:return null;default:return null}}function S1(e,t){switch(op(t),t.tag){case 3:on(Ke),Hr();break;case 26:case 27:case 5:rs(t);break;case 4:Hr();break;case 31:t.memoizedState!==null&&Vt(t);break;case 13:Vt(t);break;case 19:lt(Ge);break;case 10:on(t.type);break;case 22:case 23:Vt(t),fp(),e!==null&&lt(wl);break;case 24:on(Ke)}}function vi(e,t){try{var a=t.updateQueue,n=a!==null?a.lastEffect:null;if(n!==null){var l=n.next;a=l;do{if((a.tag&e)===e){n=void 0;var r=a.create,o=a.inst;n=r(),o.destroy=n}a=a.next}while(a!==l)}}catch(i){ke(t,t.return,i)}}function $n(e,t,a){try{var n=t.updateQueue,l=n!==null?n.lastEffect:null;if(l!==null){var r=l.next;n=r;do{if((n.tag&e)===e){var o=n.inst,i=o.destroy;if(i!==void 0){o.destroy=void 0,l=t;var u=a,c=i;try{c()}catch(s){ke(l,u,s)}}}n=n.next}while(n!==r)}}catch(s){ke(t,t.return,s)}}function k1(e){var t=e.updateQueue;if(t!==null){var a=e.stateNode;try{By(t,a)}catch(n){ke(e,e.return,n)}}}function w1(e,t,a){a.props=zl(e.type,e.memoizedProps),a.state=e.memoizedState;try{a.componentWillUnmount()}catch(n){ke(e,t,n)}}function Yo(e,t){try{var a=e.ref;if(a!==null){switch(e.tag){case 26:case 27:case 5:var n=e.stateNode;break;case 30:n=e.stateNode;break;default:n=e.stateNode}typeof a=="function"?e.refCleanup=a(n):a.current=n}}catch(l){ke(e,t,l)}}function Ea(e,t){var a=e.ref,n=e.refCleanup;if(a!==null)if(typeof n=="function")try{n()}catch(l){ke(e,t,l)}finally{e.refCleanup=null,e=e.alternate,e!=null&&(e.refCleanup=null)}else if(typeof a=="function")try{a(null)}catch(l){ke(e,t,l)}else a.current=null}function I1(e){var t=e.type,a=e.memoizedProps,n=e.stateNode;try{e:switch(t){case"button":case"input":case"select":case"textarea":a.autoFocus&&n.focus();break e;case"img":a.src?n.src=a.src:a.srcSet&&(n.srcset=a.srcSet)}}catch(l){ke(e,e.return,l)}}function Ff(e,t,a){try{var n=e.stateNode;Ik(n,e.type,a,t),n[Nt]=t}catch(l){ke(e,e.return,l)}}function A1(e){return e.tag===5||e.tag===3||e.tag===26||e.tag===27&&al(e.type)||e.tag===4}function Pf(e){e:for(;;){for(;e.sibling===null;){if(e.return===null||A1(e.return))return null;e=e.return}for(e.sibling.return=e.return,e=e.sibling;e.tag!==5&&e.tag!==6&&e.tag!==18;){if(e.tag===27&&al(e.type)||e.flags&2||e.child===null||e.tag===4)continue e;e.child.return=e,e=e.child}if(!(e.flags&2))return e.stateNode}}function Td(e,t,a){var n=e.tag;if(n===5||n===6)e=e.stateNode,t?(a.nodeType===9?a.body:a.nodeName==="HTML"?a.ownerDocument.body:a).insertBefore(e,t):(t=a.nodeType===9?a.body:a.nodeName==="HTML"?a.ownerDocument.body:a,t.appendChild(e),a=a._reactRootContainer,a!=null||t.onclick!==null||(t.onclick=nn));else if(n!==4&&(n===27&&al(e.type)&&(a=e.stateNode,t=null),e=e.child,e!==null))for(Td(e,t,a),e=e.sibling;e!==null;)Td(e,t,a),e=e.sibling}function bs(e,t,a){var n=e.tag;if(n===5||n===6)e=e.stateNode,t?a.insertBefore(e,t):a.appendChild(e);else if(n!==4&&(n===27&&al(e.type)&&(a=e.stateNode),e=e.child,e!==null))for(bs(e,t,a),e=e.sibling;e!==null;)bs(e,t,a),e=e.sibling}function T1(e){var t=e.stateNode,a=e.memoizedProps;try{for(var n=e.type,l=t.attributes;l.length;)t.removeAttributeNode(l[0]);pt(t,n,a),t[ct]=e,t[Nt]=a}catch(r){ke(e,e.return,r)}}var tn=!1,Ye=!1,Hf=!1,ix=typeof WeakSet=="function"?WeakSet:Set,at=null;function ik(e,t){if(e=e.containerInfo,Od=Ms,e=hy(e),tp(e)){if("selectionStart"in e)var a={start:e.selectionStart,end:e.selectionEnd};else e:{a=(a=e.ownerDocument)&&a.defaultView||window;var n=a.getSelection&&a.getSelection();if(n&&n.rangeCount!==0){a=n.anchorNode;var l=n.anchorOffset,r=n.focusNode;n=n.focusOffset;try{a.nodeType,r.nodeType}catch{a=null;break e}var o=0,i=-1,u=-1,c=0,s=0,f=e,p=null;t:for(;;){for(var d;f!==a||l!==0&&f.nodeType!==3||(i=o+l),f!==r||n!==0&&f.nodeType!==3||(u=o+n),f.nodeType===3&&(o+=f.nodeValue.length),(d=f.firstChild)!==null;)p=f,f=d;for(;;){if(f===e)break t;if(p===a&&++c===l&&(i=o),p===r&&++s===n&&(u=o),(d=f.nextSibling)!==null)break;f=p,p=f.parentNode}f=d}a=i===-1||u===-1?null:{start:i,end:u}}else a=null}a=a||{start:0,end:0}}else a=null;for(Nd={focusedElem:e,selectionRange:a},Ms=!1,at=t;at!==null;)if(t=at,e=t.child,(t.subtreeFlags&1028)!==0&&e!==null)e.return=t,at=e;else for(;at!==null;){switch(t=at,r=t.alternate,e=t.flags,t.tag){case 0:if((e&4)!==0&&(e=t.updateQueue,e=e!==null?e.events:null,e!==null))for(a=0;a<e.length;a++)l=e[a],l.ref.impl=l.nextImpl;break;case 11:case 15:break;case 1:if((e&1024)!==0&&r!==null){e=void 0,a=t,l=r.memoizedProps,r=r.memoizedState,n=a.stateNode;try{var h=zl(a.type,l);e=n.getSnapshotBeforeUpdate(h,r),n.__reactInternalSnapshotBeforeUpdate=e}catch(y){ke(a,a.return,y)}}break;case 3:if((e&1024)!==0){if(e=t.stateNode.containerInfo,a=e.nodeType,a===9)Ud(e);else if(a===1)switch(e.nodeName){case"HEAD":case"HTML":case"BODY":Ud(e);break;default:e.textContent=""}}break;case 5:case 26:case 27:case 6:case 4:case 17:break;default:if((e&1024)!==0)throw Error(M(163))}if(e=t.sibling,e!==null){e.return=t.return,at=e;break}at=t.return}}function D1(e,t,a){var n=a.flags;switch(a.tag){case 0:case 11:case 15:Wa(e,a),n&4&&vi(5,a);break;case 1:if(Wa(e,a),n&4)if(e=a.stateNode,t===null)try{e.componentDidMount()}catch(o){ke(a,a.return,o)}else{var l=zl(a.type,t.memoizedProps);t=t.memoizedState;try{e.componentDidUpdate(l,t,e.__reactInternalSnapshotBeforeUpdate)}catch(o){ke(a,a.return,o)}}n&64&&k1(a),n&512&&Yo(a,a.return);break;case 3:if(Wa(e,a),n&64&&(e=a.updateQueue,e!==null)){if(t=null,a.child!==null)switch(a.child.tag){case 27:case 5:t=a.child.stateNode;break;case 1:t=a.child.stateNode}try{By(e,t)}catch(o){ke(a,a.return,o)}}break;case 27:t===null&&n&4&&T1(a);case 26:case 5:Wa(e,a),t===null&&n&4&&I1(a),n&512&&Yo(a,a.return);break;case 12:Wa(e,a);break;case 31:Wa(e,a),n&4&&z1(e,a);break;case 13:Wa(e,a),n&4&&B1(e,a),n&64&&(e=a.memoizedState,e!==null&&(e=e.dehydrated,e!==null&&(a=gk.bind(null,a),Rk(e,a))));break;case 22:if(n=a.memoizedState!==null||tn,!n){t=t!==null&&t.memoizedState!==null||Ye,l=tn;var r=Ye;tn=n,(Ye=t)&&!r?$a(e,a,(a.subtreeFlags&8772)!==0):Wa(e,a),tn=l,Ye=r}break;case 30:break;default:Wa(e,a)}}function M1(e){var t=e.alternate;t!==null&&(e.alternate=null,M1(t)),e.child=null,e.deletions=null,e.sibling=null,e.tag===5&&(t=e.stateNode,t!==null&&Kd(t)),e.stateNode=null,e.return=null,e.dependencies=null,e.memoizedProps=null,e.memoizedState=null,e.pendingProps=null,e.stateNode=null,e.updateQueue=null}var Ne=null,Bt=!1;function Ja(e,t,a){for(a=a.child;a!==null;)E1(e,t,a),a=a.sibling}function E1(e,t,a){if(Yt&&typeof Yt.onCommitFiberUnmount=="function")try{Yt.onCommitFiberUnmount(mi,a)}catch{}switch(a.tag){case 26:Ye||Ea(a,t),Ja(e,t,a),a.memoizedState?a.memoizedState.count--:a.stateNode&&(a=a.stateNode,a.parentNode.removeChild(a));break;case 27:Ye||Ea(a,t);var n=Ne,l=Bt;al(a.type)&&(Ne=a.stateNode,Bt=!1),Ja(e,t,a),Wo(a.stateNode),Ne=n,Bt=l;break;case 5:Ye||Ea(a,t);case 6:if(n=Ne,l=Bt,Ne=null,Ja(e,t,a),Ne=n,Bt=l,Ne!==null)if(Bt)try{(Ne.nodeType===9?Ne.body:Ne.nodeName==="HTML"?Ne.ownerDocument.body:Ne).removeChild(a.stateNode)}catch(r){ke(a,t,r)}else try{Ne.removeChild(a.stateNode)}catch(r){ke(a,t,r)}break;case 18:Ne!==null&&(Bt?(e=Ne,Cx(e.nodeType===9?e.body:e.nodeName==="HTML"?e.ownerDocument.body:e,a.stateNode),Jr(e)):Cx(Ne,a.stateNode));break;case 4:n=Ne,l=Bt,Ne=a.stateNode.containerInfo,Bt=!0,Ja(e,t,a),Ne=n,Bt=l;break;case 0:case 11:case 14:case 15:$n(2,a,t),Ye||$n(4,a,t),Ja(e,t,a);break;case 1:Ye||(Ea(a,t),n=a.stateNode,typeof n.componentWillUnmount=="function"&&w1(a,t,n)),Ja(e,t,a);break;case 21:Ja(e,t,a);break;case 22:Ye=(n=Ye)||a.memoizedState!==null,Ja(e,t,a),Ye=n;break;default:Ja(e,t,a)}}function z1(e,t){if(t.memoizedState===null&&(e=t.alternate,e!==null&&(e=e.memoizedState,e!==null))){e=e.dehydrated;try{Jr(e)}catch(a){ke(t,t.return,a)}}}function B1(e,t){if(t.memoizedState===null&&(e=t.alternate,e!==null&&(e=e.memoizedState,e!==null&&(e=e.dehydrated,e!==null))))try{Jr(e)}catch(a){ke(t,t.return,a)}}function uk(e){switch(e.tag){case 31:case 13:case 19:var t=e.stateNode;return t===null&&(t=e.stateNode=new ix),t;case 22:return e=e.stateNode,t=e._retryCache,t===null&&(t=e._retryCache=new ix),t;default:throw Error(M(435,e.tag))}}function Nu(e,t){var a=uk(e);t.forEach(function(n){if(!a.has(n)){a.add(n);var l=xk.bind(null,e,n);n.then(l,l)}})}function Et(e,t){var a=t.deletions;if(a!==null)for(var n=0;n<a.length;n++){var l=a[n],r=e,o=t,i=o;e:for(;i!==null;){switch(i.tag){case 27:if(al(i.type)){Ne=i.stateNode,Bt=!1;break e}break;case 5:Ne=i.stateNode,Bt=!1;break e;case 3:case 4:Ne=i.stateNode.containerInfo,Bt=!0;break e}i=i.return}if(Ne===null)throw Error(M(160));E1(r,o,l),Ne=null,Bt=!1,r=l.alternate,r!==null&&(r.return=null),l.return=null}if(t.subtreeFlags&13886)for(t=t.child;t!==null;)R1(t,e),t=t.sibling}var La=null;function R1(e,t){var a=e.alternate,n=e.flags;switch(e.tag){case 0:case 11:case 14:case 15:Et(t,e),zt(e),n&4&&($n(3,e,e.return),vi(3,e),$n(5,e,e.return));break;case 1:Et(t,e),zt(e),n&512&&(Ye||a===null||Ea(a,a.return)),n&64&&tn&&(e=e.updateQueue,e!==null&&(n=e.callbacks,n!==null&&(a=e.shared.hiddenCallbacks,e.shared.hiddenCallbacks=a===null?n:a.concat(n))));break;case 26:var l=La;if(Et(t,e),zt(e),n&512&&(Ye||a===null||Ea(a,a.return)),n&4){var r=a!==null?a.memoizedState:null;if(n=e.memoizedState,a===null)if(n===null)if(e.stateNode===null){e:{n=e.type,a=e.memoizedProps,l=l.ownerDocument||l;t:switch(n){case"title":r=l.getElementsByTagName("title")[0],(!r||r[xi]||r[ct]||r.namespaceURI==="http://www.w3.org/2000/svg"||r.hasAttribute("itemprop"))&&(r=l.createElement(n),l.head.insertBefore(r,l.querySelector("head > title"))),pt(r,n,a),r[ct]=e,nt(r),n=r;break e;case"link":var o=Dx("link","href",l).get(n+(a.href||""));if(o){for(var i=0;i<o.length;i++)if(r=o[i],r.getAttribute("href")===(a.href==null||a.href===""?null:a.href)&&r.getAttribute("rel")===(a.rel==null?null:a.rel)&&r.getAttribute("title")===(a.title==null?null:a.title)&&r.getAttribute("crossorigin")===(a.crossOrigin==null?null:a.crossOrigin)){o.splice(i,1);break t}}r=l.createElement(n),pt(r,n,a),l.head.appendChild(r);break;case"meta":if(o=Dx("meta","content",l).get(n+(a.content||""))){for(i=0;i<o.length;i++)if(r=o[i],r.getAttribute("content")===(a.content==null?null:""+a.content)&&r.getAttribute("name")===(a.name==null?null:a.name)&&r.getAttribute("property")===(a.property==null?null:a.property)&&r.getAttribute("http-equiv")===(a.httpEquiv==null?null:a.httpEquiv)&&r.getAttribute("charset")===(a.charSet==null?null:a.charSet)){o.splice(i,1);break t}}r=l.createElement(n),pt(r,n,a),l.head.appendChild(r);break;default:throw Error(M(468,n))}r[ct]=e,nt(r),n=r}e.stateNode=n}else Mx(l,e.type,e.stateNode);else e.stateNode=Tx(l,n,e.memoizedProps);else r!==n?(r===null?a.stateNode!==null&&(a=a.stateNode,a.parentNode.removeChild(a)):r.count--,n===null?Mx(l,e.type,e.stateNode):Tx(l,n,e.memoizedProps)):n===null&&e.stateNode!==null&&Ff(e,e.memoizedProps,a.memoizedProps)}break;case 27:Et(t,e),zt(e),n&512&&(Ye||a===null||Ea(a,a.return)),a!==null&&n&4&&Ff(e,e.memoizedProps,a.memoizedProps);break;case 5:if(Et(t,e),zt(e),n&512&&(Ye||a===null||Ea(a,a.return)),e.flags&32){l=e.stateNode;try{Gr(l,"")}catch(h){ke(e,e.return,h)}}n&4&&e.stateNode!=null&&(l=e.memoizedProps,Ff(e,l,a!==null?a.memoizedProps:l)),n&1024&&(Hf=!0);break;case 6:if(Et(t,e),zt(e),n&4){if(e.stateNode===null)throw Error(M(162));n=e.memoizedProps,a=e.stateNode;try{a.nodeValue=n}catch(h){ke(e,e.return,h)}}break;case 3:if(es=null,l=La,La=As(t.containerInfo),Et(t,e),La=l,zt(e),n&4&&a!==null&&a.memoizedState.isDehydrated)try{Jr(t.containerInfo)}catch(h){ke(e,e.return,h)}Hf&&(Hf=!1,O1(e));break;case 4:n=La,La=As(e.stateNode.containerInfo),Et(t,e),zt(e),La=n;break;case 12:Et(t,e),zt(e);break;case 31:Et(t,e),zt(e),n&4&&(n=e.updateQueue,n!==null&&(e.updateQueue=null,Nu(e,n)));break;case 13:Et(t,e),zt(e),e.child.flags&8192&&e.memoizedState!==null!=(a!==null&&a.memoizedState!==null)&&(Gs=Qt()),n&4&&(n=e.updateQueue,n!==null&&(e.updateQueue=null,Nu(e,n)));break;case 22:l=e.memoizedState!==null;var u=a!==null&&a.memoizedState!==null,c=tn,s=Ye;if(tn=c||l,Ye=s||u,Et(t,e),Ye=s,tn=c,zt(e),n&8192)e:for(t=e.stateNode,t._visibility=l?t._visibility&-2:t._visibility|1,l&&(a===null||u||tn||Ye||Cl(e)),a=null,t=e;;){if(t.tag===5||t.tag===26){if(a===null){u=a=t;try{if(r=u.stateNode,l)o=r.style,typeof o.setProperty=="function"?o.setProperty("display","none","important"):o.display="none";else{i=u.stateNode;var f=u.memoizedProps.style,p=f!=null&&f.hasOwnProperty("display")?f.display:null;i.style.display=p==null||typeof p=="boolean"?"":(""+p).trim()}}catch(h){ke(u,u.return,h)}}}else if(t.tag===6){if(a===null){u=t;try{u.stateNode.nodeValue=l?"":u.memoizedProps}catch(h){ke(u,u.return,h)}}}else if(t.tag===18){if(a===null){u=t;try{var d=u.stateNode;l?Sx(d,!0):Sx(u.stateNode,!1)}catch(h){ke(u,u.return,h)}}}else if((t.tag!==22&&t.tag!==23||t.memoizedState===null||t===e)&&t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break e;for(;t.sibling===null;){if(t.return===null||t.return===e)break e;a===t&&(a=null),t=t.return}a===t&&(a=null),t.sibling.return=t.return,t=t.sibling}n&4&&(n=e.updateQueue,n!==null&&(a=n.retryQueue,a!==null&&(n.retryQueue=null,Nu(e,a))));break;case 19:Et(t,e),zt(e),n&4&&(n=e.updateQueue,n!==null&&(e.updateQueue=null,Nu(e,n)));break;case 30:break;case 21:break;default:Et(t,e),zt(e)}}function zt(e){var t=e.flags;if(t&2){try{for(var a,n=e.return;n!==null;){if(A1(n)){a=n;break}n=n.return}if(a==null)throw Error(M(160));switch(a.tag){case 27:var l=a.stateNode,r=Pf(e);bs(e,r,l);break;case 5:var o=a.stateNode;a.flags&32&&(Gr(o,""),a.flags&=-33);var i=Pf(e);bs(e,i,o);break;case 3:case 4:var u=a.stateNode.containerInfo,c=Pf(e);Td(e,c,u);break;default:throw Error(M(161))}}catch(s){ke(e,e.return,s)}e.flags&=-3}t&4096&&(e.flags&=-4097)}function O1(e){if(e.subtreeFlags&1024)for(e=e.child;e!==null;){var t=e;O1(t),t.tag===5&&t.flags&1024&&t.stateNode.reset(),e=e.sibling}}function Wa(e,t){if(t.subtreeFlags&8772)for(t=t.child;t!==null;)D1(e,t.alternate,t),t=t.sibling}function Cl(e){for(e=e.child;e!==null;){var t=e;switch(t.tag){case 0:case 11:case 14:case 15:$n(4,t,t.return),Cl(t);break;case 1:Ea(t,t.return);var a=t.stateNode;typeof a.componentWillUnmount=="function"&&w1(t,t.return,a),Cl(t);break;case 27:Wo(t.stateNode);case 26:case 5:Ea(t,t.return),Cl(t);break;case 22:t.memoizedState===null&&Cl(t);break;case 30:Cl(t);break;default:Cl(t)}e=e.sibling}}function $a(e,t,a){for(a=a&&(t.subtreeFlags&8772)!==0,t=t.child;t!==null;){var n=t.alternate,l=e,r=t,o=r.flags;switch(r.tag){case 0:case 11:case 15:$a(l,r,a),vi(4,r);break;case 1:if($a(l,r,a),n=r,l=n.stateNode,typeof l.componentDidMount=="function")try{l.componentDidMount()}catch(c){ke(n,n.return,c)}if(n=r,l=n.updateQueue,l!==null){var i=n.stateNode;try{var u=l.shared.hiddenCallbacks;if(u!==null)for(l.shared.hiddenCallbacks=null,l=0;l<u.length;l++)zy(u[l],i)}catch(c){ke(n,n.return,c)}}a&&o&64&&k1(r),Yo(r,r.return);break;case 27:T1(r);case 26:case 5:$a(l,r,a),a&&n===null&&o&4&&I1(r),Yo(r,r.return);break;case 12:$a(l,r,a);break;case 31:$a(l,r,a),a&&o&4&&z1(l,r);break;case 13:$a(l,r,a),a&&o&4&&B1(l,r);break;case 22:r.memoizedState===null&&$a(l,r,a),Yo(r,r.return);break;case 30:break;default:$a(l,r,a)}t=t.sibling}}function Ap(e,t){var a=null;e!==null&&e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(a=e.memoizedState.cachePool.pool),e=null,t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(e=t.memoizedState.cachePool.pool),e!==a&&(e!=null&&e.refCount++,a!=null&&bi(a))}function Tp(e,t){e=null,t.alternate!==null&&(e=t.alternate.memoizedState.cache),t=t.memoizedState.cache,t!==e&&(t.refCount++,e!=null&&bi(e))}function ba(e,t,a,n){if(t.subtreeFlags&10256)for(t=t.child;t!==null;)N1(e,t,a,n),t=t.sibling}function N1(e,t,a,n){var l=t.flags;switch(t.tag){case 0:case 11:case 15:ba(e,t,a,n),l&2048&&vi(9,t);break;case 1:ba(e,t,a,n);break;case 3:ba(e,t,a,n),l&2048&&(e=null,t.alternate!==null&&(e=t.alternate.memoizedState.cache),t=t.memoizedState.cache,t!==e&&(t.refCount++,e!=null&&bi(e)));break;case 12:if(l&2048){ba(e,t,a,n),e=t.stateNode;try{var r=t.memoizedProps,o=r.id,i=r.onPostCommit;typeof i=="function"&&i(o,t.alternate===null?"mount":"update",e.passiveEffectDuration,-0)}catch(u){ke(t,t.return,u)}}else ba(e,t,a,n);break;case 31:ba(e,t,a,n);break;case 13:ba(e,t,a,n);break;case 23:break;case 22:r=t.stateNode,o=t.alternate,t.memoizedState!==null?r._visibility&2?ba(e,t,a,n):Ko(e,t):r._visibility&2?ba(e,t,a,n):(r._visibility|=2,Lr(e,t,a,n,(t.subtreeFlags&10256)!==0||!1)),l&2048&&Ap(o,t);break;case 24:ba(e,t,a,n),l&2048&&Tp(t.alternate,t);break;default:ba(e,t,a,n)}}function Lr(e,t,a,n,l){for(l=l&&((t.subtreeFlags&10256)!==0||!1),t=t.child;t!==null;){var r=e,o=t,i=a,u=n,c=o.flags;switch(o.tag){case 0:case 11:case 15:Lr(r,o,i,u,l),vi(8,o);break;case 23:break;case 22:var s=o.stateNode;o.memoizedState!==null?s._visibility&2?Lr(r,o,i,u,l):Ko(r,o):(s._visibility|=2,Lr(r,o,i,u,l)),l&&c&2048&&Ap(o.alternate,o);break;case 24:Lr(r,o,i,u,l),l&&c&2048&&Tp(o.alternate,o);break;default:Lr(r,o,i,u,l)}t=t.sibling}}function Ko(e,t){if(t.subtreeFlags&10256)for(t=t.child;t!==null;){var a=e,n=t,l=n.flags;switch(n.tag){case 22:Ko(a,n),l&2048&&Ap(n.alternate,n);break;case 24:Ko(a,n),l&2048&&Tp(n.alternate,n);break;default:Ko(a,n)}t=t.sibling}}var Fo=8192;function br(e,t,a){if(e.subtreeFlags&Fo)for(e=e.child;e!==null;)q1(e,t,a),e=e.sibling}function q1(e,t,a){switch(e.tag){case 26:br(e,t,a),e.flags&Fo&&e.memoizedState!==null&&Xk(a,La,e.memoizedState,e.memoizedProps);break;case 5:br(e,t,a);break;case 3:case 4:var n=La;La=As(e.stateNode.containerInfo),br(e,t,a),La=n;break;case 22:e.memoizedState===null&&(n=e.alternate,n!==null&&n.memoizedState!==null?(n=Fo,Fo=16777216,br(e,t,a),Fo=n):br(e,t,a));break;default:br(e,t,a)}}function U1(e){var t=e.alternate;if(t!==null&&(e=t.child,e!==null)){t.child=null;do t=e.sibling,e.sibling=null,e=t;while(e!==null)}}function zo(e){var t=e.deletions;if((e.flags&16)!==0){if(t!==null)for(var a=0;a<t.length;a++){var n=t[a];at=n,P1(n,e)}U1(e)}if(e.subtreeFlags&10256)for(e=e.child;e!==null;)F1(e),e=e.sibling}function F1(e){switch(e.tag){case 0:case 11:case 15:zo(e),e.flags&2048&&$n(9,e,e.return);break;case 3:zo(e);break;case 12:zo(e);break;case 22:var t=e.stateNode;e.memoizedState!==null&&t._visibility&2&&(e.return===null||e.return.tag!==13)?(t._visibility&=-3,Wu(e)):zo(e);break;default:zo(e)}}function Wu(e){var t=e.deletions;if((e.flags&16)!==0){if(t!==null)for(var a=0;a<t.length;a++){var n=t[a];at=n,P1(n,e)}U1(e)}for(e=e.child;e!==null;){switch(t=e,t.tag){case 0:case 11:case 15:$n(8,t,t.return),Wu(t);break;case 22:a=t.stateNode,a._visibility&2&&(a._visibility&=-3,Wu(t));break;default:Wu(t)}e=e.sibling}}function P1(e,t){for(;at!==null;){var a=at;switch(a.tag){case 0:case 11:case 15:$n(8,a,t);break;case 23:case 22:if(a.memoizedState!==null&&a.memoizedState.cachePool!==null){var n=a.memoizedState.cachePool.pool;n!=null&&n.refCount++}break;case 24:bi(a.memoizedState.cache)}if(n=a.child,n!==null)n.return=a,at=n;else e:for(a=e;at!==null;){n=at;var l=n.sibling,r=n.return;if(M1(n),n===a){at=null;break e}if(l!==null){l.return=r,at=l;break e}at=r}}}var sk={getCacheForType:function(e){var t=dt(Ke),a=t.data.get(e);return a===void 0&&(a=e(),t.data.set(e,a)),a},cacheSignal:function(){return dt(Ke).controller.signal}},ck=typeof WeakMap=="function"?WeakMap:Map,ye=0,Te=null,fe=null,de=0,Se=0,Gt=null,Fn=!1,ao=!1,Dp=!1,pn=0,Fe=0,el=0,Al=0,Mp=0,Xt=0,Qr=0,Zo=null,Rt=null,Dd=!1,Gs=0,H1=0,Ls=1/0,vs=null,Xn=null,We=0,Qn=null,Yr=null,un=0,Md=0,Ed=null,_1=null,Jo=0,zd=null;function Zt(){return(ye&2)!==0&&de!==0?de&-de:$.T!==null?zp():Jx()}function G1(){if(Xt===0)if((de&536870912)===0||ge){var e=Iu;Iu<<=1,(Iu&3932160)===0&&(Iu=262144),Xt=e}else Xt=536870912;return e=Wt.current,e!==null&&(e.flags|=32),Xt}function Ot(e,t,a){(e===Te&&(Se===2||Se===9)||e.cancelPendingCommit!==null)&&(Kr(e,0),Pn(e,de,Xt,!1)),gi(e,a),((ye&2)===0||e!==Te)&&(e===Te&&((ye&2)===0&&(Al|=a),Fe===4&&Pn(e,de,Xt,!1)),Ra(e))}function V1(e,t,a){if((ye&6)!==0)throw Error(M(327));var n=!a&&(t&127)===0&&(t&e.expiredLanes)===0||hi(e,t),l=n?pk(e,t):_f(e,t,!0),r=n;do{if(l===0){ao&&!n&&Pn(e,t,0,!1);break}else{if(a=e.current.alternate,r&&!fk(a)){l=_f(e,t,!1),r=!1;continue}if(l===2){if(r=t,e.errorRecoveryDisabledLanes&r)var o=0;else o=e.pendingLanes&-536870913,o=o!==0?o:o&536870912?536870912:0;if(o!==0){t=o;e:{var i=e;l=Zo;var u=i.current.memoizedState.isDehydrated;if(u&&(Kr(i,o).flags|=256),o=_f(i,o,!1),o!==2){if(Dp&&!u){i.errorRecoveryDisabledLanes|=r,Al|=r,l=4;break e}r=Rt,Rt=l,r!==null&&(Rt===null?Rt=r:Rt.push.apply(Rt,r))}l=o}if(r=!1,l!==2)continue}}if(l===1){Kr(e,0),Pn(e,t,0,!0);break}e:{switch(n=e,r=l,r){case 0:case 1:throw Error(M(345));case 4:if((t&4194048)!==t)break;case 6:Pn(n,t,Xt,!Fn);break e;case 2:Rt=null;break;case 3:case 5:break;default:throw Error(M(329))}if((t&62914560)===t&&(l=Gs+300-Qt(),10<l)){if(Pn(n,t,Xt,!Fn),zs(n,0,!0)!==0)break e;un=t,n.timeoutHandle=cb(ux.bind(null,n,a,Rt,vs,Dd,t,Xt,Al,Qr,Fn,r,"Throttled",-0,0),l);break e}ux(n,a,Rt,vs,Dd,t,Xt,Al,Qr,Fn,r,null,-0,0)}}break}while(!0);Ra(e)}function ux(e,t,a,n,l,r,o,i,u,c,s,f,p,d){if(e.timeoutHandle=-1,f=t.subtreeFlags,f&8192||(f&16785408)===16785408){f={stylesheets:null,count:0,imgCount:0,imgBytes:0,suspenseyImages:[],waitingForImages:!0,waitingForViewTransition:!1,unsuspend:nn},q1(t,r,f);var h=(r&62914560)===r?Gs-Qt():(r&4194048)===r?H1-Qt():0;if(h=Qk(f,h),h!==null){un=r,e.cancelPendingCommit=h(cx.bind(null,e,t,r,a,n,l,o,i,u,s,f,null,p,d)),Pn(e,r,o,!c);return}}cx(e,t,r,a,n,l,o,i,u)}function fk(e){for(var t=e;;){var a=t.tag;if((a===0||a===11||a===15)&&t.flags&16384&&(a=t.updateQueue,a!==null&&(a=a.stores,a!==null)))for(var n=0;n<a.length;n++){var l=a[n],r=l.getSnapshot;l=l.value;try{if(!Jt(r(),l))return!1}catch{return!1}}if(a=t.child,t.subtreeFlags&16384&&a!==null)a.return=t,t=a;else{if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return!0;t=t.return}t.sibling.return=t.return,t=t.sibling}}return!0}function Pn(e,t,a,n){t&=~Mp,t&=~Al,e.suspendedLanes|=t,e.pingedLanes&=~t,n&&(e.warmLanes|=t),n=e.expirationTimes;for(var l=t;0<l;){var r=31-Kt(l),o=1<<r;n[r]=-1,l&=~o}a!==0&&Yx(e,a,t)}function Vs(){return(ye&6)===0?(Ci(0,!1),!1):!0}function Ep(){if(fe!==null){if(Se===0)var e=fe.return;else e=fe,ln=ql=null,gp(e),Ur=null,ri=0,e=fe;for(;e!==null;)S1(e.alternate,e),e=e.return;fe=null}}function Kr(e,t){var a=e.timeoutHandle;a!==-1&&(e.timeoutHandle=-1,Dk(a)),a=e.cancelPendingCommit,a!==null&&(e.cancelPendingCommit=null,a()),un=0,Ep(),Te=e,fe=a=rn(e.current,null),de=t,Se=0,Gt=null,Fn=!1,ao=hi(e,t),Dp=!1,Qr=Xt=Mp=Al=el=Fe=0,Rt=Zo=null,Dd=!1,(t&8)!==0&&(t|=t&32);var n=e.entangledLanes;if(n!==0)for(e=e.entanglements,n&=t;0<n;){var l=31-Kt(n),r=1<<l;t|=e[l],n&=~r}return pn=t,Ns(),a}function j1(e,t){oe=null,$.H=ii,t===to||t===Us?(t=Pg(),Se=3):t===sp?(t=Pg(),Se=4):Se=t===wp?8:t!==null&&typeof t=="object"&&typeof t.then=="function"?6:1,Gt=t,fe===null&&(Fe=1,xs(e,oa(t,e.current)))}function X1(){var e=Wt.current;return e===null?!0:(de&4194048)===de?ua===null:(de&62914560)===de||(de&536870912)!==0?e===ua:!1}function Q1(){var e=$.H;return $.H=ii,e===null?ii:e}function Y1(){var e=$.A;return $.A=sk,e}function Cs(){Fe=4,Fn||(de&4194048)!==de&&Wt.current!==null||(ao=!0),(el&134217727)===0&&(Al&134217727)===0||Te===null||Pn(Te,de,Xt,!1)}function _f(e,t,a){var n=ye;ye|=2;var l=Q1(),r=Y1();(Te!==e||de!==t)&&(vs=null,Kr(e,t)),t=!1;var o=Fe;e:do try{if(Se!==0&&fe!==null){var i=fe,u=Gt;switch(Se){case 8:Ep(),o=6;break e;case 3:case 2:case 9:case 6:Wt.current===null&&(t=!0);var c=Se;if(Se=0,Gt=null,Br(e,i,u,c),a&&ao){o=0;break e}break;default:c=Se,Se=0,Gt=null,Br(e,i,u,c)}}dk(),o=Fe;break}catch(s){j1(e,s)}while(!0);return t&&e.shellSuspendCounter++,ln=ql=null,ye=n,$.H=l,$.A=r,fe===null&&(Te=null,de=0,Ns()),o}function dk(){for(;fe!==null;)K1(fe)}function pk(e,t){var a=ye;ye|=2;var n=Q1(),l=Y1();Te!==e||de!==t?(vs=null,Ls=Qt()+500,Kr(e,t)):ao=hi(e,t);e:do try{if(Se!==0&&fe!==null){t=fe;var r=Gt;t:switch(Se){case 1:Se=0,Gt=null,Br(e,t,r,1);break;case 2:case 9:if(Fg(r)){Se=0,Gt=null,sx(t);break}t=function(){Se!==2&&Se!==9||Te!==e||(Se=7),Ra(e)},r.then(t,t);break e;case 3:Se=7;break e;case 4:Se=5;break e;case 7:Fg(r)?(Se=0,Gt=null,sx(t)):(Se=0,Gt=null,Br(e,t,r,7));break;case 5:var o=null;switch(fe.tag){case 26:o=fe.memoizedState;case 5:case 27:var i=fe;if(o?hb(o):i.stateNode.complete){Se=0,Gt=null;var u=i.sibling;if(u!==null)fe=u;else{var c=i.return;c!==null?(fe=c,js(c)):fe=null}break t}}Se=0,Gt=null,Br(e,t,r,5);break;case 6:Se=0,Gt=null,Br(e,t,r,6);break;case 8:Ep(),Fe=6;break e;default:throw Error(M(462))}}mk();break}catch(s){j1(e,s)}while(!0);return ln=ql=null,$.H=n,$.A=l,ye=a,fe!==null?0:(Te=null,de=0,Ns(),Fe)}function mk(){for(;fe!==null&&!qC();)K1(fe)}function K1(e){var t=C1(e.alternate,e,pn);e.memoizedProps=e.pendingProps,t===null?js(e):fe=t}function sx(e){var t=e,a=t.alternate;switch(t.tag){case 15:case 0:t=ax(a,t,t.pendingProps,t.type,void 0,de);break;case 11:t=ax(a,t,t.pendingProps,t.type.render,t.ref,de);break;case 5:gp(t);default:S1(a,t),t=fe=Sy(t,pn),t=C1(a,t,pn)}e.memoizedProps=e.pendingProps,t===null?js(e):fe=t}function Br(e,t,a,n){ln=ql=null,gp(t),Ur=null,ri=0;var l=t.return;try{if(ak(e,l,t,a,de)){Fe=1,xs(e,oa(a,e.current)),fe=null;return}}catch(r){if(l!==null)throw fe=l,r;Fe=1,xs(e,oa(a,e.current)),fe=null;return}t.flags&32768?(ge||n===1?e=!0:ao||(de&536870912)!==0?e=!1:(Fn=e=!0,(n===2||n===9||n===3||n===6)&&(n=Wt.current,n!==null&&n.tag===13&&(n.flags|=16384))),Z1(t,e)):js(t)}function js(e){var t=e;do{if((t.flags&32768)!==0){Z1(t,Fn);return}e=t.return;var a=rk(t.alternate,t,pn);if(a!==null){fe=a;return}if(t=t.sibling,t!==null){fe=t;return}fe=t=e}while(t!==null);Fe===0&&(Fe=5)}function Z1(e,t){do{var a=ok(e.alternate,e);if(a!==null){a.flags&=32767,fe=a;return}if(a=e.return,a!==null&&(a.flags|=32768,a.subtreeFlags=0,a.deletions=null),!t&&(e=e.sibling,e!==null)){fe=e;return}fe=e=a}while(e!==null);Fe=6,fe=null}function cx(e,t,a,n,l,r,o,i,u){e.cancelPendingCommit=null;do Xs();while(We!==0);if((ye&6)!==0)throw Error(M(327));if(t!==null){if(t===e.current)throw Error(M(177));if(r=t.lanes|t.childLanes,r|=ap,QC(e,a,r,o,i,u),e===Te&&(fe=Te=null,de=0),Yr=t,Qn=e,un=a,Md=r,Ed=l,_1=n,(t.subtreeFlags&10256)!==0||(t.flags&10256)!==0?(e.callbackNode=null,e.callbackPriority=0,yk(os,function(){return tb(),null})):(e.callbackNode=null,e.callbackPriority=0),n=(t.flags&13878)!==0,(t.subtreeFlags&13878)!==0||n){n=$.T,$.T=null,l=be.p,be.p=2,o=ye,ye|=4;try{ik(e,t,a)}finally{ye=o,be.p=l,$.T=n}}We=1,J1(),W1(),$1()}}function J1(){if(We===1){We=0;var e=Qn,t=Yr,a=(t.flags&13878)!==0;if((t.subtreeFlags&13878)!==0||a){a=$.T,$.T=null;var n=be.p;be.p=2;var l=ye;ye|=4;try{R1(t,e);var r=Nd,o=hy(e.containerInfo),i=r.focusedElem,u=r.selectionRange;if(o!==i&&i&&i.ownerDocument&&my(i.ownerDocument.documentElement,i)){if(u!==null&&tp(i)){var c=u.start,s=u.end;if(s===void 0&&(s=c),"selectionStart"in i)i.selectionStart=c,i.selectionEnd=Math.min(s,i.value.length);else{var f=i.ownerDocument||document,p=f&&f.defaultView||window;if(p.getSelection){var d=p.getSelection(),h=i.textContent.length,y=Math.min(u.start,h),k=u.end===void 0?y:Math.min(u.end,h);!d.extend&&y>k&&(o=k,k=y,y=o);var g=zg(i,y),m=zg(i,k);if(g&&m&&(d.rangeCount!==1||d.anchorNode!==g.node||d.anchorOffset!==g.offset||d.focusNode!==m.node||d.focusOffset!==m.offset)){var x=f.createRange();x.setStart(g.node,g.offset),d.removeAllRanges(),y>k?(d.addRange(x),d.extend(m.node,m.offset)):(x.setEnd(m.node,m.offset),d.addRange(x))}}}}for(f=[],d=i;d=d.parentNode;)d.nodeType===1&&f.push({element:d,left:d.scrollLeft,top:d.scrollTop});for(typeof i.focus=="function"&&i.focus(),i=0;i<f.length;i++){var S=f[i];S.element.scrollLeft=S.left,S.element.scrollTop=S.top}}Ms=!!Od,Nd=Od=null}finally{ye=l,be.p=n,$.T=a}}e.current=t,We=2}}function W1(){if(We===2){We=0;var e=Qn,t=Yr,a=(t.flags&8772)!==0;if((t.subtreeFlags&8772)!==0||a){a=$.T,$.T=null;var n=be.p;be.p=2;var l=ye;ye|=4;try{D1(e,t.alternate,t)}finally{ye=l,be.p=n,$.T=a}}We=3}}function $1(){if(We===4||We===3){We=0,UC();var e=Qn,t=Yr,a=un,n=_1;(t.subtreeFlags&10256)!==0||(t.flags&10256)!==0?We=5:(We=0,Yr=Qn=null,eb(e,e.pendingLanes));var l=e.pendingLanes;if(l===0&&(Xn=null),Yd(a),t=t.stateNode,Yt&&typeof Yt.onCommitFiberRoot=="function")try{Yt.onCommitFiberRoot(mi,t,void 0,(t.current.flags&128)===128)}catch{}if(n!==null){t=$.T,l=be.p,be.p=2,$.T=null;try{for(var r=e.onRecoverableError,o=0;o<n.length;o++){var i=n[o];r(i.value,{componentStack:i.stack})}}finally{$.T=t,be.p=l}}(un&3)!==0&&Xs(),Ra(e),l=e.pendingLanes,(a&261930)!==0&&(l&42)!==0?e===zd?Jo++:(Jo=0,zd=e):Jo=0,Ci(0,!1)}}function eb(e,t){(e.pooledCacheLanes&=t)===0&&(t=e.pooledCache,t!=null&&(e.pooledCache=null,bi(t)))}function Xs(){return J1(),W1(),$1(),tb()}function tb(){if(We!==5)return!1;var e=Qn,t=Md;Md=0;var a=Yd(un),n=$.T,l=be.p;try{be.p=32>a?32:a,$.T=null,a=Ed,Ed=null;var r=Qn,o=un;if(We=0,Yr=Qn=null,un=0,(ye&6)!==0)throw Error(M(331));var i=ye;if(ye|=4,F1(r.current),N1(r,r.current,o,a),ye=i,Ci(0,!1),Yt&&typeof Yt.onPostCommitFiberRoot=="function")try{Yt.onPostCommitFiberRoot(mi,r)}catch{}return!0}finally{be.p=l,$.T=n,eb(e,t)}}function fx(e,t,a){t=oa(a,t),t=wd(e.stateNode,t,2),e=jn(e,t,2),e!==null&&(gi(e,2),Ra(e))}function ke(e,t,a){if(e.tag===3)fx(e,e,a);else for(;t!==null;){if(t.tag===3){fx(t,e,a);break}else if(t.tag===1){var n=t.stateNode;if(typeof t.type.getDerivedStateFromError=="function"||typeof n.componentDidCatch=="function"&&(Xn===null||!Xn.has(n))){e=oa(a,e),a=g1(2),n=jn(t,a,2),n!==null&&(x1(a,n,t,e),gi(n,2),Ra(n));break}}t=t.return}}function Gf(e,t,a){var n=e.pingCache;if(n===null){n=e.pingCache=new ck;var l=new Set;n.set(t,l)}else l=n.get(t),l===void 0&&(l=new Set,n.set(t,l));l.has(a)||(Dp=!0,l.add(a),e=hk.bind(null,e,t,a),t.then(e,e))}function hk(e,t,a){var n=e.pingCache;n!==null&&n.delete(t),e.pingedLanes|=e.suspendedLanes&a,e.warmLanes&=~a,Te===e&&(de&a)===a&&(Fe===4||Fe===3&&(de&62914560)===de&&300>Qt()-Gs?(ye&2)===0&&Kr(e,0):Mp|=a,Qr===de&&(Qr=0)),Ra(e)}function ab(e,t){t===0&&(t=Qx()),e=Nl(e,t),e!==null&&(gi(e,t),Ra(e))}function gk(e){var t=e.memoizedState,a=0;t!==null&&(a=t.retryLane),ab(e,a)}function xk(e,t){var a=0;switch(e.tag){case 31:case 13:var n=e.stateNode,l=e.memoizedState;l!==null&&(a=l.retryLane);break;case 19:n=e.stateNode;break;case 22:n=e.stateNode._retryCache;break;default:throw Error(M(314))}n!==null&&n.delete(t),ab(e,a)}function yk(e,t){return Xd(e,t)}var Ss=null,vr=null,Bd=!1,ks=!1,Vf=!1,Hn=0;function Ra(e){e!==vr&&e.next===null&&(vr===null?Ss=vr=e:vr=vr.next=e),ks=!0,Bd||(Bd=!0,Lk())}function Ci(e,t){if(!Vf&&ks){Vf=!0;do for(var a=!1,n=Ss;n!==null;){if(!t)if(e!==0){var l=n.pendingLanes;if(l===0)var r=0;else{var o=n.suspendedLanes,i=n.pingedLanes;r=(1<<31-Kt(42|e)+1)-1,r&=l&~(o&~i),r=r&201326741?r&201326741|1:r?r|2:0}r!==0&&(a=!0,dx(n,r))}else r=de,r=zs(n,n===Te?r:0,n.cancelPendingCommit!==null||n.timeoutHandle!==-1),(r&3)===0||hi(n,r)||(a=!0,dx(n,r));n=n.next}while(a);Vf=!1}}function bk(){nb()}function nb(){ks=Bd=!1;var e=0;Hn!==0&&Tk()&&(e=Hn);for(var t=Qt(),a=null,n=Ss;n!==null;){var l=n.next,r=lb(n,t);r===0?(n.next=null,a===null?Ss=l:a.next=l,l===null&&(vr=a)):(a=n,(e!==0||(r&3)!==0)&&(ks=!0)),n=l}We!==0&&We!==5||Ci(e,!1),Hn!==0&&(Hn=0)}function lb(e,t){for(var a=e.suspendedLanes,n=e.pingedLanes,l=e.expirationTimes,r=e.pendingLanes&-62914561;0<r;){var o=31-Kt(r),i=1<<o,u=l[o];u===-1?((i&a)===0||(i&n)!==0)&&(l[o]=XC(i,t)):u<=t&&(e.expiredLanes|=i),r&=~i}if(t=Te,a=de,a=zs(e,e===t?a:0,e.cancelPendingCommit!==null||e.timeoutHandle!==-1),n=e.callbackNode,a===0||e===t&&(Se===2||Se===9)||e.cancelPendingCommit!==null)return n!==null&&n!==null&&bf(n),e.callbackNode=null,e.callbackPriority=0;if((a&3)===0||hi(e,a)){if(t=a&-a,t===e.callbackPriority)return t;switch(n!==null&&bf(n),Yd(a)){case 2:case 8:a=jx;break;case 32:a=os;break;case 268435456:a=Xx;break;default:a=os}return n=rb.bind(null,e),a=Xd(a,n),e.callbackPriority=t,e.callbackNode=a,t}return n!==null&&n!==null&&bf(n),e.callbackPriority=2,e.callbackNode=null,2}function rb(e,t){if(We!==0&&We!==5)return e.callbackNode=null,e.callbackPriority=0,null;var a=e.callbackNode;if(Xs()&&e.callbackNode!==a)return null;var n=de;return n=zs(e,e===Te?n:0,e.cancelPendingCommit!==null||e.timeoutHandle!==-1),n===0?null:(V1(e,n,t),lb(e,Qt()),e.callbackNode!=null&&e.callbackNode===a?rb.bind(null,e):null)}function dx(e,t){if(Xs())return null;V1(e,t,!0)}function Lk(){Mk(function(){(ye&6)!==0?Xd(Vx,bk):nb()})}function zp(){if(Hn===0){var e=Vr;e===0&&(e=wu,wu<<=1,(wu&261888)===0&&(wu=256)),Hn=e}return Hn}function px(e){return e==null||typeof e=="symbol"||typeof e=="boolean"?null:typeof e=="function"?e:Gu(""+e)}function mx(e,t){var a=t.ownerDocument.createElement("input");return a.name=t.name,a.value=t.value,e.id&&a.setAttribute("form",e.id),t.parentNode.insertBefore(a,t),e=new FormData(e),a.parentNode.removeChild(a),e}function vk(e,t,a,n,l){if(t==="submit"&&a&&a.stateNode===l){var r=px((l[Nt]||null).action),o=n.submitter;o&&(t=(t=o[Nt]||null)?px(t.formAction):o.getAttribute("formAction"),t!==null&&(r=t,o=null));var i=new Bs("action","action",null,n,l);e.push({event:i,listeners:[{instance:null,listener:function(){if(n.defaultPrevented){if(Hn!==0){var u=o?mx(l,o):new FormData(l);Sd(a,{pending:!0,data:u,method:l.method,action:r},null,u)}}else typeof r=="function"&&(i.preventDefault(),u=o?mx(l,o):new FormData(l),Sd(a,{pending:!0,data:u,method:l.method,action:r},r,u))},currentTarget:l}]})}}for(qu=0;qu<fd.length;qu++)Uu=fd[qu],hx=Uu.toLowerCase(),gx=Uu[0].toUpperCase()+Uu.slice(1),va(hx,"on"+gx);var Uu,hx,gx,qu;va(xy,"onAnimationEnd");va(yy,"onAnimationIteration");va(by,"onAnimationStart");va("dblclick","onDoubleClick");va("focusin","onFocus");va("focusout","onBlur");va(FS,"onTransitionRun");va(PS,"onTransitionStart");va(HS,"onTransitionCancel");va(Ly,"onTransitionEnd");_r("onMouseEnter",["mouseout","mouseover"]);_r("onMouseLeave",["mouseout","mouseover"]);_r("onPointerEnter",["pointerout","pointerover"]);_r("onPointerLeave",["pointerout","pointerover"]);Bl("onChange","change click focusin focusout input keydown keyup selectionchange".split(" "));Bl("onSelect","focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));Bl("onBeforeInput",["compositionend","keypress","textInput","paste"]);Bl("onCompositionEnd","compositionend focusout keydown keypress keyup mousedown".split(" "));Bl("onCompositionStart","compositionstart focusout keydown keypress keyup mousedown".split(" "));Bl("onCompositionUpdate","compositionupdate focusout keydown keypress keyup mousedown".split(" "));var ui="abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "),Ck=new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(ui));function ob(e,t){t=(t&4)!==0;for(var a=0;a<e.length;a++){var n=e[a],l=n.event;n=n.listeners;e:{var r=void 0;if(t)for(var o=n.length-1;0<=o;o--){var i=n[o],u=i.instance,c=i.currentTarget;if(i=i.listener,u!==r&&l.isPropagationStopped())break e;r=i,l.currentTarget=c;try{r(l)}catch(s){us(s)}l.currentTarget=null,r=u}else for(o=0;o<n.length;o++){if(i=n[o],u=i.instance,c=i.currentTarget,i=i.listener,u!==r&&l.isPropagationStopped())break e;r=i,l.currentTarget=c;try{r(l)}catch(s){us(s)}l.currentTarget=null,r=u}}}}function ce(e,t){var a=t[nd];a===void 0&&(a=t[nd]=new Set);var n=e+"__bubble";a.has(n)||(ib(t,e,2,!1),a.add(n))}function jf(e,t,a){var n=0;t&&(n|=4),ib(a,e,n,t)}var Fu="_reactListening"+Math.random().toString(36).slice(2);function Bp(e){if(!e[Fu]){e[Fu]=!0,Wx.forEach(function(a){a!=="selectionchange"&&(Ck.has(a)||jf(a,!1,e),jf(a,!0,e))});var t=e.nodeType===9?e:e.ownerDocument;t===null||t[Fu]||(t[Fu]=!0,jf("selectionchange",!1,t))}}function ib(e,t,a,n){switch(Lb(t)){case 2:var l=Zk;break;case 8:l=Jk;break;default:l=qp}a=l.bind(null,t,a,e),l=void 0,!ud||t!=="touchstart"&&t!=="touchmove"&&t!=="wheel"||(l=!0),n?l!==void 0?e.addEventListener(t,a,{capture:!0,passive:l}):e.addEventListener(t,a,!0):l!==void 0?e.addEventListener(t,a,{passive:l}):e.addEventListener(t,a,!1)}function Xf(e,t,a,n,l){var r=n;if((t&1)===0&&(t&2)===0&&n!==null)e:for(;;){if(n===null)return;var o=n.tag;if(o===3||o===4){var i=n.stateNode.containerInfo;if(i===l)break;if(o===4)for(o=n.return;o!==null;){var u=o.tag;if((u===3||u===4)&&o.stateNode.containerInfo===l)return;o=o.return}for(;i!==null;){if(o=kr(i),o===null)return;if(u=o.tag,u===5||u===6||u===26||u===27){n=r=o;continue e}i=i.parentNode}}n=n.return}oy(function(){var c=r,s=Jd(a),f=[];e:{var p=vy.get(e);if(p!==void 0){var d=Bs,h=e;switch(e){case"keypress":if(ju(a)===0)break e;case"keydown":case"keyup":d=xS;break;case"focusin":h="focus",d=kf;break;case"focusout":h="blur",d=kf;break;case"beforeblur":case"afterblur":d=kf;break;case"click":if(a.button===2)break e;case"auxclick":case"dblclick":case"mousedown":case"mousemove":case"mouseup":case"mouseout":case"mouseover":case"contextmenu":d=Sg;break;case"drag":case"dragend":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"dragstart":case"drop":d=rS;break;case"touchcancel":case"touchend":case"touchmove":case"touchstart":d=LS;break;case xy:case yy:case by:d=uS;break;case Ly:d=CS;break;case"scroll":case"scrollend":d=nS;break;case"wheel":d=kS;break;case"copy":case"cut":case"paste":d=cS;break;case"gotpointercapture":case"lostpointercapture":case"pointercancel":case"pointerdown":case"pointermove":case"pointerout":case"pointerover":case"pointerup":d=wg;break;case"toggle":case"beforetoggle":d=IS}var y=(t&4)!==0,k=!y&&(e==="scroll"||e==="scrollend"),g=y?p!==null?p+"Capture":null:p;y=[];for(var m=c,x;m!==null;){var S=m;if(x=S.stateNode,S=S.tag,S!==5&&S!==26&&S!==27||x===null||g===null||(S=ei(m,g),S!=null&&y.push(si(m,S,x))),k)break;m=m.return}0<y.length&&(p=new d(p,h,null,a,s),f.push({event:p,listeners:y}))}}if((t&7)===0){e:{if(p=e==="mouseover"||e==="pointerover",d=e==="mouseout"||e==="pointerout",p&&a!==id&&(h=a.relatedTarget||a.fromElement)&&(kr(h)||h[Wr]))break e;if((d||p)&&(p=s.window===s?s:(p=s.ownerDocument)?p.defaultView||p.parentWindow:window,d?(h=a.relatedTarget||a.toElement,d=c,h=h?kr(h):null,h!==null&&(k=pi(h),y=h.tag,h!==k||y!==5&&y!==27&&y!==6)&&(h=null)):(d=null,h=c),d!==h)){if(y=Sg,S="onMouseLeave",g="onMouseEnter",m="mouse",(e==="pointerout"||e==="pointerover")&&(y=wg,S="onPointerLeave",g="onPointerEnter",m="pointer"),k=d==null?p:qo(d),x=h==null?p:qo(h),p=new y(S,m+"leave",d,a,s),p.target=k,p.relatedTarget=x,S=null,kr(s)===c&&(y=new y(g,m+"enter",h,a,s),y.target=x,y.relatedTarget=k,S=y),k=S,d&&h)t:{for(y=Sk,g=d,m=h,x=0,S=g;S;S=y(S))x++;S=0;for(var I=m;I;I=y(I))S++;for(;0<x-S;)g=y(g),x--;for(;0<S-x;)m=y(m),S--;for(;x--;){if(g===m||m!==null&&g===m.alternate){y=g;break t}g=y(g),m=y(m)}y=null}else y=null;d!==null&&xx(f,p,d,y,!1),h!==null&&k!==null&&xx(f,k,h,y,!0)}}e:{if(p=c?qo(c):window,d=p.nodeName&&p.nodeName.toLowerCase(),d==="select"||d==="input"&&p.type==="file")var v=Dg;else if(Tg(p))if(dy)v=NS;else{v=RS;var T=BS}else d=p.nodeName,!d||d.toLowerCase()!=="input"||p.type!=="checkbox"&&p.type!=="radio"?c&&Zd(c.elementType)&&(v=Dg):v=OS;if(v&&(v=v(e,c))){fy(f,v,a,s);break e}T&&T(e,p,c),e==="focusout"&&c&&p.type==="number"&&c.memoizedProps.value!=null&&od(p,"number",p.value)}switch(T=c?qo(c):window,e){case"focusin":(Tg(T)||T.contentEditable==="true")&&(Ar=T,sd=c,_o=null);break;case"focusout":_o=sd=Ar=null;break;case"mousedown":cd=!0;break;case"contextmenu":case"mouseup":case"dragend":cd=!1,Bg(f,a,s);break;case"selectionchange":if(US)break;case"keydown":case"keyup":Bg(f,a,s)}var N;if(ep)e:{switch(e){case"compositionstart":var U="onCompositionStart";break e;case"compositionend":U="onCompositionEnd";break e;case"compositionupdate":U="onCompositionUpdate";break e}U=void 0}else Ir?sy(e,a)&&(U="onCompositionEnd"):e==="keydown"&&a.keyCode===229&&(U="onCompositionStart");U&&(uy&&a.locale!=="ko"&&(Ir||U!=="onCompositionStart"?U==="onCompositionEnd"&&Ir&&(N=iy()):(Un=s,Wd="value"in Un?Un.value:Un.textContent,Ir=!0)),T=ws(c,U),0<T.length&&(U=new kg(U,e,null,a,s),f.push({event:U,listeners:T}),N?U.data=N:(N=cy(a),N!==null&&(U.data=N)))),(N=TS?DS(e,a):MS(e,a))&&(U=ws(c,"onBeforeInput"),0<U.length&&(T=new kg("onBeforeInput","beforeinput",null,a,s),f.push({event:T,listeners:U}),T.data=N)),vk(f,e,c,a,s)}ob(f,t)})}function si(e,t,a){return{instance:e,listener:t,currentTarget:a}}function ws(e,t){for(var a=t+"Capture",n=[];e!==null;){var l=e,r=l.stateNode;if(l=l.tag,l!==5&&l!==26&&l!==27||r===null||(l=ei(e,a),l!=null&&n.unshift(si(e,l,r)),l=ei(e,t),l!=null&&n.push(si(e,l,r))),e.tag===3)return n;e=e.return}return[]}function Sk(e){if(e===null)return null;do e=e.return;while(e&&e.tag!==5&&e.tag!==27);return e||null}function xx(e,t,a,n,l){for(var r=t._reactName,o=[];a!==null&&a!==n;){var i=a,u=i.alternate,c=i.stateNode;if(i=i.tag,u!==null&&u===n)break;i!==5&&i!==26&&i!==27||c===null||(u=c,l?(c=ei(a,r),c!=null&&o.unshift(si(a,c,u))):l||(c=ei(a,r),c!=null&&o.push(si(a,c,u)))),a=a.return}o.length!==0&&e.push({event:t,listeners:o})}var kk=/\r\n?/g,wk=/\u0000|\uFFFD/g;function yx(e){return(typeof e=="string"?e:""+e).replace(kk,`
`).replace(wk,"")}function ub(e,t){return t=yx(t),yx(e)===t}function we(e,t,a,n,l,r){switch(a){case"children":typeof n=="string"?t==="body"||t==="textarea"&&n===""||Gr(e,n):(typeof n=="number"||typeof n=="bigint")&&t!=="body"&&Gr(e,""+n);break;case"className":Tu(e,"class",n);break;case"tabIndex":Tu(e,"tabindex",n);break;case"dir":case"role":case"viewBox":case"width":case"height":Tu(e,a,n);break;case"style":ry(e,n,r);break;case"data":if(t!=="object"){Tu(e,"data",n);break}case"src":case"href":if(n===""&&(t!=="a"||a!=="href")){e.removeAttribute(a);break}if(n==null||typeof n=="function"||typeof n=="symbol"||typeof n=="boolean"){e.removeAttribute(a);break}n=Gu(""+n),e.setAttribute(a,n);break;case"action":case"formAction":if(typeof n=="function"){e.setAttribute(a,"javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')");break}else typeof r=="function"&&(a==="formAction"?(t!=="input"&&we(e,t,"name",l.name,l,null),we(e,t,"formEncType",l.formEncType,l,null),we(e,t,"formMethod",l.formMethod,l,null),we(e,t,"formTarget",l.formTarget,l,null)):(we(e,t,"encType",l.encType,l,null),we(e,t,"method",l.method,l,null),we(e,t,"target",l.target,l,null)));if(n==null||typeof n=="symbol"||typeof n=="boolean"){e.removeAttribute(a);break}n=Gu(""+n),e.setAttribute(a,n);break;case"onClick":n!=null&&(e.onclick=nn);break;case"onScroll":n!=null&&ce("scroll",e);break;case"onScrollEnd":n!=null&&ce("scrollend",e);break;case"dangerouslySetInnerHTML":if(n!=null){if(typeof n!="object"||!("__html"in n))throw Error(M(61));if(a=n.__html,a!=null){if(l.children!=null)throw Error(M(60));e.innerHTML=a}}break;case"multiple":e.multiple=n&&typeof n!="function"&&typeof n!="symbol";break;case"muted":e.muted=n&&typeof n!="function"&&typeof n!="symbol";break;case"suppressContentEditableWarning":case"suppressHydrationWarning":case"defaultValue":case"defaultChecked":case"innerHTML":case"ref":break;case"autoFocus":break;case"xlinkHref":if(n==null||typeof n=="function"||typeof n=="boolean"||typeof n=="symbol"){e.removeAttribute("xlink:href");break}a=Gu(""+n),e.setAttributeNS("http://www.w3.org/1999/xlink","xlink:href",a);break;case"contentEditable":case"spellCheck":case"draggable":case"value":case"autoReverse":case"externalResourcesRequired":case"focusable":case"preserveAlpha":n!=null&&typeof n!="function"&&typeof n!="symbol"?e.setAttribute(a,""+n):e.removeAttribute(a);break;case"inert":case"allowFullScreen":case"async":case"autoPlay":case"controls":case"default":case"defer":case"disabled":case"disablePictureInPicture":case"disableRemotePlayback":case"formNoValidate":case"hidden":case"loop":case"noModule":case"noValidate":case"open":case"playsInline":case"readOnly":case"required":case"reversed":case"scoped":case"seamless":case"itemScope":n&&typeof n!="function"&&typeof n!="symbol"?e.setAttribute(a,""):e.removeAttribute(a);break;case"capture":case"download":n===!0?e.setAttribute(a,""):n!==!1&&n!=null&&typeof n!="function"&&typeof n!="symbol"?e.setAttribute(a,n):e.removeAttribute(a);break;case"cols":case"rows":case"size":case"span":n!=null&&typeof n!="function"&&typeof n!="symbol"&&!isNaN(n)&&1<=n?e.setAttribute(a,n):e.removeAttribute(a);break;case"rowSpan":case"start":n==null||typeof n=="function"||typeof n=="symbol"||isNaN(n)?e.removeAttribute(a):e.setAttribute(a,n);break;case"popover":ce("beforetoggle",e),ce("toggle",e),_u(e,"popover",n);break;case"xlinkActuate":Ka(e,"http://www.w3.org/1999/xlink","xlink:actuate",n);break;case"xlinkArcrole":Ka(e,"http://www.w3.org/1999/xlink","xlink:arcrole",n);break;case"xlinkRole":Ka(e,"http://www.w3.org/1999/xlink","xlink:role",n);break;case"xlinkShow":Ka(e,"http://www.w3.org/1999/xlink","xlink:show",n);break;case"xlinkTitle":Ka(e,"http://www.w3.org/1999/xlink","xlink:title",n);break;case"xlinkType":Ka(e,"http://www.w3.org/1999/xlink","xlink:type",n);break;case"xmlBase":Ka(e,"http://www.w3.org/XML/1998/namespace","xml:base",n);break;case"xmlLang":Ka(e,"http://www.w3.org/XML/1998/namespace","xml:lang",n);break;case"xmlSpace":Ka(e,"http://www.w3.org/XML/1998/namespace","xml:space",n);break;case"is":_u(e,"is",n);break;case"innerText":case"textContent":break;default:(!(2<a.length)||a[0]!=="o"&&a[0]!=="O"||a[1]!=="n"&&a[1]!=="N")&&(a=tS.get(a)||a,_u(e,a,n))}}function Rd(e,t,a,n,l,r){switch(a){case"style":ry(e,n,r);break;case"dangerouslySetInnerHTML":if(n!=null){if(typeof n!="object"||!("__html"in n))throw Error(M(61));if(a=n.__html,a!=null){if(l.children!=null)throw Error(M(60));e.innerHTML=a}}break;case"children":typeof n=="string"?Gr(e,n):(typeof n=="number"||typeof n=="bigint")&&Gr(e,""+n);break;case"onScroll":n!=null&&ce("scroll",e);break;case"onScrollEnd":n!=null&&ce("scrollend",e);break;case"onClick":n!=null&&(e.onclick=nn);break;case"suppressContentEditableWarning":case"suppressHydrationWarning":case"innerHTML":case"ref":break;case"innerText":case"textContent":break;default:if(!$x.hasOwnProperty(a))e:{if(a[0]==="o"&&a[1]==="n"&&(l=a.endsWith("Capture"),t=a.slice(2,l?a.length-7:void 0),r=e[Nt]||null,r=r!=null?r[a]:null,typeof r=="function"&&e.removeEventListener(t,r,l),typeof n=="function")){typeof r!="function"&&r!==null&&(a in e?e[a]=null:e.hasAttribute(a)&&e.removeAttribute(a)),e.addEventListener(t,n,l);break e}a in e?e[a]=n:n===!0?e.setAttribute(a,""):_u(e,a,n)}}}function pt(e,t,a){switch(t){case"div":case"span":case"svg":case"path":case"a":case"g":case"p":case"li":break;case"img":ce("error",e),ce("load",e);var n=!1,l=!1,r;for(r in a)if(a.hasOwnProperty(r)){var o=a[r];if(o!=null)switch(r){case"src":n=!0;break;case"srcSet":l=!0;break;case"children":case"dangerouslySetInnerHTML":throw Error(M(137,t));default:we(e,t,r,o,a,null)}}l&&we(e,t,"srcSet",a.srcSet,a,null),n&&we(e,t,"src",a.src,a,null);return;case"input":ce("invalid",e);var i=r=o=l=null,u=null,c=null;for(n in a)if(a.hasOwnProperty(n)){var s=a[n];if(s!=null)switch(n){case"name":l=s;break;case"type":o=s;break;case"checked":u=s;break;case"defaultChecked":c=s;break;case"value":r=s;break;case"defaultValue":i=s;break;case"children":case"dangerouslySetInnerHTML":if(s!=null)throw Error(M(137,t));break;default:we(e,t,n,s,a,null)}}ay(e,r,i,u,c,o,l,!1);return;case"select":ce("invalid",e),n=o=r=null;for(l in a)if(a.hasOwnProperty(l)&&(i=a[l],i!=null))switch(l){case"value":r=i;break;case"defaultValue":o=i;break;case"multiple":n=i;default:we(e,t,l,i,a,null)}t=r,a=o,e.multiple=!!n,t!=null?Or(e,!!n,t,!1):a!=null&&Or(e,!!n,a,!0);return;case"textarea":ce("invalid",e),r=l=n=null;for(o in a)if(a.hasOwnProperty(o)&&(i=a[o],i!=null))switch(o){case"value":n=i;break;case"defaultValue":l=i;break;case"children":r=i;break;case"dangerouslySetInnerHTML":if(i!=null)throw Error(M(91));break;default:we(e,t,o,i,a,null)}ly(e,n,l,r);return;case"option":for(u in a)if(a.hasOwnProperty(u)&&(n=a[u],n!=null))switch(u){case"selected":e.selected=n&&typeof n!="function"&&typeof n!="symbol";break;default:we(e,t,u,n,a,null)}return;case"dialog":ce("beforetoggle",e),ce("toggle",e),ce("cancel",e),ce("close",e);break;case"iframe":case"object":ce("load",e);break;case"video":case"audio":for(n=0;n<ui.length;n++)ce(ui[n],e);break;case"image":ce("error",e),ce("load",e);break;case"details":ce("toggle",e);break;case"embed":case"source":case"link":ce("error",e),ce("load",e);case"area":case"base":case"br":case"col":case"hr":case"keygen":case"meta":case"param":case"track":case"wbr":case"menuitem":for(c in a)if(a.hasOwnProperty(c)&&(n=a[c],n!=null))switch(c){case"children":case"dangerouslySetInnerHTML":throw Error(M(137,t));default:we(e,t,c,n,a,null)}return;default:if(Zd(t)){for(s in a)a.hasOwnProperty(s)&&(n=a[s],n!==void 0&&Rd(e,t,s,n,a,void 0));return}}for(i in a)a.hasOwnProperty(i)&&(n=a[i],n!=null&&we(e,t,i,n,a,null))}function Ik(e,t,a,n){switch(t){case"div":case"span":case"svg":case"path":case"a":case"g":case"p":case"li":break;case"input":var l=null,r=null,o=null,i=null,u=null,c=null,s=null;for(d in a){var f=a[d];if(a.hasOwnProperty(d)&&f!=null)switch(d){case"checked":break;case"value":break;case"defaultValue":u=f;default:n.hasOwnProperty(d)||we(e,t,d,null,n,f)}}for(var p in n){var d=n[p];if(f=a[p],n.hasOwnProperty(p)&&(d!=null||f!=null))switch(p){case"type":r=d;break;case"name":l=d;break;case"checked":c=d;break;case"defaultChecked":s=d;break;case"value":o=d;break;case"defaultValue":i=d;break;case"children":case"dangerouslySetInnerHTML":if(d!=null)throw Error(M(137,t));break;default:d!==f&&we(e,t,p,d,n,f)}}rd(e,o,i,u,c,s,r,l);return;case"select":d=o=i=p=null;for(r in a)if(u=a[r],a.hasOwnProperty(r)&&u!=null)switch(r){case"value":break;case"multiple":d=u;default:n.hasOwnProperty(r)||we(e,t,r,null,n,u)}for(l in n)if(r=n[l],u=a[l],n.hasOwnProperty(l)&&(r!=null||u!=null))switch(l){case"value":p=r;break;case"defaultValue":i=r;break;case"multiple":o=r;default:r!==u&&we(e,t,l,r,n,u)}t=i,a=o,n=d,p!=null?Or(e,!!a,p,!1):!!n!=!!a&&(t!=null?Or(e,!!a,t,!0):Or(e,!!a,a?[]:"",!1));return;case"textarea":d=p=null;for(i in a)if(l=a[i],a.hasOwnProperty(i)&&l!=null&&!n.hasOwnProperty(i))switch(i){case"value":break;case"children":break;default:we(e,t,i,null,n,l)}for(o in n)if(l=n[o],r=a[o],n.hasOwnProperty(o)&&(l!=null||r!=null))switch(o){case"value":p=l;break;case"defaultValue":d=l;break;case"children":break;case"dangerouslySetInnerHTML":if(l!=null)throw Error(M(91));break;default:l!==r&&we(e,t,o,l,n,r)}ny(e,p,d);return;case"option":for(var h in a)if(p=a[h],a.hasOwnProperty(h)&&p!=null&&!n.hasOwnProperty(h))switch(h){case"selected":e.selected=!1;break;default:we(e,t,h,null,n,p)}for(u in n)if(p=n[u],d=a[u],n.hasOwnProperty(u)&&p!==d&&(p!=null||d!=null))switch(u){case"selected":e.selected=p&&typeof p!="function"&&typeof p!="symbol";break;default:we(e,t,u,p,n,d)}return;case"img":case"link":case"area":case"base":case"br":case"col":case"embed":case"hr":case"keygen":case"meta":case"param":case"source":case"track":case"wbr":case"menuitem":for(var y in a)p=a[y],a.hasOwnProperty(y)&&p!=null&&!n.hasOwnProperty(y)&&we(e,t,y,null,n,p);for(c in n)if(p=n[c],d=a[c],n.hasOwnProperty(c)&&p!==d&&(p!=null||d!=null))switch(c){case"children":case"dangerouslySetInnerHTML":if(p!=null)throw Error(M(137,t));break;default:we(e,t,c,p,n,d)}return;default:if(Zd(t)){for(var k in a)p=a[k],a.hasOwnProperty(k)&&p!==void 0&&!n.hasOwnProperty(k)&&Rd(e,t,k,void 0,n,p);for(s in n)p=n[s],d=a[s],!n.hasOwnProperty(s)||p===d||p===void 0&&d===void 0||Rd(e,t,s,p,n,d);return}}for(var g in a)p=a[g],a.hasOwnProperty(g)&&p!=null&&!n.hasOwnProperty(g)&&we(e,t,g,null,n,p);for(f in n)p=n[f],d=a[f],!n.hasOwnProperty(f)||p===d||p==null&&d==null||we(e,t,f,p,n,d)}function bx(e){switch(e){case"css":case"script":case"font":case"img":case"image":case"input":case"link":return!0;default:return!1}}function Ak(){if(typeof performance.getEntriesByType=="function"){for(var e=0,t=0,a=performance.getEntriesByType("resource"),n=0;n<a.length;n++){var l=a[n],r=l.transferSize,o=l.initiatorType,i=l.duration;if(r&&i&&bx(o)){for(o=0,i=l.responseEnd,n+=1;n<a.length;n++){var u=a[n],c=u.startTime;if(c>i)break;var s=u.transferSize,f=u.initiatorType;s&&bx(f)&&(u=u.responseEnd,o+=s*(u<i?1:(i-c)/(u-c)))}if(--n,t+=8*(r+o)/(l.duration/1e3),e++,10<e)break}}if(0<e)return t/e/1e6}return navigator.connection&&(e=navigator.connection.downlink,typeof e=="number")?e:5}var Od=null,Nd=null;function Is(e){return e.nodeType===9?e:e.ownerDocument}function Lx(e){switch(e){case"http://www.w3.org/2000/svg":return 1;case"http://www.w3.org/1998/Math/MathML":return 2;default:return 0}}function sb(e,t){if(e===0)switch(t){case"svg":return 1;case"math":return 2;default:return 0}return e===1&&t==="foreignObject"?0:e}function qd(e,t){return e==="textarea"||e==="noscript"||typeof t.children=="string"||typeof t.children=="number"||typeof t.children=="bigint"||typeof t.dangerouslySetInnerHTML=="object"&&t.dangerouslySetInnerHTML!==null&&t.dangerouslySetInnerHTML.__html!=null}var Qf=null;function Tk(){var e=window.event;return e&&e.type==="popstate"?e===Qf?!1:(Qf=e,!0):(Qf=null,!1)}var cb=typeof setTimeout=="function"?setTimeout:void 0,Dk=typeof clearTimeout=="function"?clearTimeout:void 0,vx=typeof Promise=="function"?Promise:void 0,Mk=typeof queueMicrotask=="function"?queueMicrotask:typeof vx<"u"?function(e){return vx.resolve(null).then(e).catch(Ek)}:cb;function Ek(e){setTimeout(function(){throw e})}function al(e){return e==="head"}function Cx(e,t){var a=t,n=0;do{var l=a.nextSibling;if(e.removeChild(a),l&&l.nodeType===8)if(a=l.data,a==="/$"||a==="/&"){if(n===0){e.removeChild(l),Jr(t);return}n--}else if(a==="$"||a==="$?"||a==="$~"||a==="$!"||a==="&")n++;else if(a==="html")Wo(e.ownerDocument.documentElement);else if(a==="head"){a=e.ownerDocument.head,Wo(a);for(var r=a.firstChild;r;){var o=r.nextSibling,i=r.nodeName;r[xi]||i==="SCRIPT"||i==="STYLE"||i==="LINK"&&r.rel.toLowerCase()==="stylesheet"||a.removeChild(r),r=o}}else a==="body"&&Wo(e.ownerDocument.body);a=l}while(a);Jr(t)}function Sx(e,t){var a=e;e=0;do{var n=a.nextSibling;if(a.nodeType===1?t?(a._stashedDisplay=a.style.display,a.style.display="none"):(a.style.display=a._stashedDisplay||"",a.getAttribute("style")===""&&a.removeAttribute("style")):a.nodeType===3&&(t?(a._stashedText=a.nodeValue,a.nodeValue=""):a.nodeValue=a._stashedText||""),n&&n.nodeType===8)if(a=n.data,a==="/$"){if(e===0)break;e--}else a!=="$"&&a!=="$?"&&a!=="$~"&&a!=="$!"||e++;a=n}while(a)}function Ud(e){var t=e.firstChild;for(t&&t.nodeType===10&&(t=t.nextSibling);t;){var a=t;switch(t=t.nextSibling,a.nodeName){case"HTML":case"HEAD":case"BODY":Ud(a),Kd(a);continue;case"SCRIPT":case"STYLE":continue;case"LINK":if(a.rel.toLowerCase()==="stylesheet")continue}e.removeChild(a)}}function zk(e,t,a,n){for(;e.nodeType===1;){var l=a;if(e.nodeName.toLowerCase()!==t.toLowerCase()){if(!n&&(e.nodeName!=="INPUT"||e.type!=="hidden"))break}else if(n){if(!e[xi])switch(t){case"meta":if(!e.hasAttribute("itemprop"))break;return e;case"link":if(r=e.getAttribute("rel"),r==="stylesheet"&&e.hasAttribute("data-precedence"))break;if(r!==l.rel||e.getAttribute("href")!==(l.href==null||l.href===""?null:l.href)||e.getAttribute("crossorigin")!==(l.crossOrigin==null?null:l.crossOrigin)||e.getAttribute("title")!==(l.title==null?null:l.title))break;return e;case"style":if(e.hasAttribute("data-precedence"))break;return e;case"script":if(r=e.getAttribute("src"),(r!==(l.src==null?null:l.src)||e.getAttribute("type")!==(l.type==null?null:l.type)||e.getAttribute("crossorigin")!==(l.crossOrigin==null?null:l.crossOrigin))&&r&&e.hasAttribute("async")&&!e.hasAttribute("itemprop"))break;return e;default:return e}}else if(t==="input"&&e.type==="hidden"){var r=l.name==null?null:""+l.name;if(l.type==="hidden"&&e.getAttribute("name")===r)return e}else return e;if(e=sa(e.nextSibling),e===null)break}return null}function Bk(e,t,a){if(t==="")return null;for(;e.nodeType!==3;)if((e.nodeType!==1||e.nodeName!=="INPUT"||e.type!=="hidden")&&!a||(e=sa(e.nextSibling),e===null))return null;return e}function fb(e,t){for(;e.nodeType!==8;)if((e.nodeType!==1||e.nodeName!=="INPUT"||e.type!=="hidden")&&!t||(e=sa(e.nextSibling),e===null))return null;return e}function Fd(e){return e.data==="$?"||e.data==="$~"}function Pd(e){return e.data==="$!"||e.data==="$?"&&e.ownerDocument.readyState!=="loading"}function Rk(e,t){var a=e.ownerDocument;if(e.data==="$~")e._reactRetry=t;else if(e.data!=="$?"||a.readyState!=="loading")t();else{var n=function(){t(),a.removeEventListener("DOMContentLoaded",n)};a.addEventListener("DOMContentLoaded",n),e._reactRetry=n}}function sa(e){for(;e!=null;e=e.nextSibling){var t=e.nodeType;if(t===1||t===3)break;if(t===8){if(t=e.data,t==="$"||t==="$!"||t==="$?"||t==="$~"||t==="&"||t==="F!"||t==="F")break;if(t==="/$"||t==="/&")return null}}return e}var Hd=null;function kx(e){e=e.nextSibling;for(var t=0;e;){if(e.nodeType===8){var a=e.data;if(a==="/$"||a==="/&"){if(t===0)return sa(e.nextSibling);t--}else a!=="$"&&a!=="$!"&&a!=="$?"&&a!=="$~"&&a!=="&"||t++}e=e.nextSibling}return null}function wx(e){e=e.previousSibling;for(var t=0;e;){if(e.nodeType===8){var a=e.data;if(a==="$"||a==="$!"||a==="$?"||a==="$~"||a==="&"){if(t===0)return e;t--}else a!=="/$"&&a!=="/&"||t++}e=e.previousSibling}return null}function db(e,t,a){switch(t=Is(a),e){case"html":if(e=t.documentElement,!e)throw Error(M(452));return e;case"head":if(e=t.head,!e)throw Error(M(453));return e;case"body":if(e=t.body,!e)throw Error(M(454));return e;default:throw Error(M(451))}}function Wo(e){for(var t=e.attributes;t.length;)e.removeAttributeNode(t[0]);Kd(e)}var ca=new Map,Ix=new Set;function As(e){return typeof e.getRootNode=="function"?e.getRootNode():e.nodeType===9?e:e.ownerDocument}var mn=be.d;be.d={f:Ok,r:Nk,D:qk,C:Uk,L:Fk,m:Pk,X:_k,S:Hk,M:Gk};function Ok(){var e=mn.f(),t=Vs();return e||t}function Nk(e){var t=$r(e);t!==null&&t.tag===5&&t.type==="form"?r1(t):mn.r(e)}var no=typeof document>"u"?null:document;function pb(e,t,a){var n=no;if(n&&typeof t=="string"&&t){var l=ra(t);l='link[rel="'+e+'"][href="'+l+'"]',typeof a=="string"&&(l+='[crossorigin="'+a+'"]'),Ix.has(l)||(Ix.add(l),e={rel:e,crossOrigin:a,href:t},n.querySelector(l)===null&&(t=n.createElement("link"),pt(t,"link",e),nt(t),n.head.appendChild(t)))}}function qk(e){mn.D(e),pb("dns-prefetch",e,null)}function Uk(e,t){mn.C(e,t),pb("preconnect",e,t)}function Fk(e,t,a){mn.L(e,t,a);var n=no;if(n&&e&&t){var l='link[rel="preload"][as="'+ra(t)+'"]';t==="image"&&a&&a.imageSrcSet?(l+='[imagesrcset="'+ra(a.imageSrcSet)+'"]',typeof a.imageSizes=="string"&&(l+='[imagesizes="'+ra(a.imageSizes)+'"]')):l+='[href="'+ra(e)+'"]';var r=l;switch(t){case"style":r=Zr(e);break;case"script":r=lo(e)}ca.has(r)||(e=Be({rel:"preload",href:t==="image"&&a&&a.imageSrcSet?void 0:e,as:t},a),ca.set(r,e),n.querySelector(l)!==null||t==="style"&&n.querySelector(Si(r))||t==="script"&&n.querySelector(ki(r))||(t=n.createElement("link"),pt(t,"link",e),nt(t),n.head.appendChild(t)))}}function Pk(e,t){mn.m(e,t);var a=no;if(a&&e){var n=t&&typeof t.as=="string"?t.as:"script",l='link[rel="modulepreload"][as="'+ra(n)+'"][href="'+ra(e)+'"]',r=l;switch(n){case"audioworklet":case"paintworklet":case"serviceworker":case"sharedworker":case"worker":case"script":r=lo(e)}if(!ca.has(r)&&(e=Be({rel:"modulepreload",href:e},t),ca.set(r,e),a.querySelector(l)===null)){switch(n){case"audioworklet":case"paintworklet":case"serviceworker":case"sharedworker":case"worker":case"script":if(a.querySelector(ki(r)))return}n=a.createElement("link"),pt(n,"link",e),nt(n),a.head.appendChild(n)}}}function Hk(e,t,a){mn.S(e,t,a);var n=no;if(n&&e){var l=Rr(n).hoistableStyles,r=Zr(e);t=t||"default";var o=l.get(r);if(!o){var i={loading:0,preload:null};if(o=n.querySelector(Si(r)))i.loading=5;else{e=Be({rel:"stylesheet",href:e,"data-precedence":t},a),(a=ca.get(r))&&Rp(e,a);var u=o=n.createElement("link");nt(u),pt(u,"link",e),u._p=new Promise(function(c,s){u.onload=c,u.onerror=s}),u.addEventListener("load",function(){i.loading|=1}),u.addEventListener("error",function(){i.loading|=2}),i.loading|=4,$u(o,t,n)}o={type:"stylesheet",instance:o,count:1,state:i},l.set(r,o)}}}function _k(e,t){mn.X(e,t);var a=no;if(a&&e){var n=Rr(a).hoistableScripts,l=lo(e),r=n.get(l);r||(r=a.querySelector(ki(l)),r||(e=Be({src:e,async:!0},t),(t=ca.get(l))&&Op(e,t),r=a.createElement("script"),nt(r),pt(r,"link",e),a.head.appendChild(r)),r={type:"script",instance:r,count:1,state:null},n.set(l,r))}}function Gk(e,t){mn.M(e,t);var a=no;if(a&&e){var n=Rr(a).hoistableScripts,l=lo(e),r=n.get(l);r||(r=a.querySelector(ki(l)),r||(e=Be({src:e,async:!0,type:"module"},t),(t=ca.get(l))&&Op(e,t),r=a.createElement("script"),nt(r),pt(r,"link",e),a.head.appendChild(r)),r={type:"script",instance:r,count:1,state:null},n.set(l,r))}}function Ax(e,t,a,n){var l=(l=_n.current)?As(l):null;if(!l)throw Error(M(446));switch(e){case"meta":case"title":return null;case"style":return typeof a.precedence=="string"&&typeof a.href=="string"?(t=Zr(a.href),a=Rr(l).hoistableStyles,n=a.get(t),n||(n={type:"style",instance:null,count:0,state:null},a.set(t,n)),n):{type:"void",instance:null,count:0,state:null};case"link":if(a.rel==="stylesheet"&&typeof a.href=="string"&&typeof a.precedence=="string"){e=Zr(a.href);var r=Rr(l).hoistableStyles,o=r.get(e);if(o||(l=l.ownerDocument||l,o={type:"stylesheet",instance:null,count:0,state:{loading:0,preload:null}},r.set(e,o),(r=l.querySelector(Si(e)))&&!r._p&&(o.instance=r,o.state.loading=5),ca.has(e)||(a={rel:"preload",as:"style",href:a.href,crossOrigin:a.crossOrigin,integrity:a.integrity,media:a.media,hrefLang:a.hrefLang,referrerPolicy:a.referrerPolicy},ca.set(e,a),r||Vk(l,e,a,o.state))),t&&n===null)throw Error(M(528,""));return o}if(t&&n!==null)throw Error(M(529,""));return null;case"script":return t=a.async,a=a.src,typeof a=="string"&&t&&typeof t!="function"&&typeof t!="symbol"?(t=lo(a),a=Rr(l).hoistableScripts,n=a.get(t),n||(n={type:"script",instance:null,count:0,state:null},a.set(t,n)),n):{type:"void",instance:null,count:0,state:null};default:throw Error(M(444,e))}}function Zr(e){return'href="'+ra(e)+'"'}function Si(e){return'link[rel="stylesheet"]['+e+"]"}function mb(e){return Be({},e,{"data-precedence":e.precedence,precedence:null})}function Vk(e,t,a,n){e.querySelector('link[rel="preload"][as="style"]['+t+"]")?n.loading=1:(t=e.createElement("link"),n.preload=t,t.addEventListener("load",function(){return n.loading|=1}),t.addEventListener("error",function(){return n.loading|=2}),pt(t,"link",a),nt(t),e.head.appendChild(t))}function lo(e){return'[src="'+ra(e)+'"]'}function ki(e){return"script[async]"+e}function Tx(e,t,a){if(t.count++,t.instance===null)switch(t.type){case"style":var n=e.querySelector('style[data-href~="'+ra(a.href)+'"]');if(n)return t.instance=n,nt(n),n;var l=Be({},a,{"data-href":a.href,"data-precedence":a.precedence,href:null,precedence:null});return n=(e.ownerDocument||e).createElement("style"),nt(n),pt(n,"style",l),$u(n,a.precedence,e),t.instance=n;case"stylesheet":l=Zr(a.href);var r=e.querySelector(Si(l));if(r)return t.state.loading|=4,t.instance=r,nt(r),r;n=mb(a),(l=ca.get(l))&&Rp(n,l),r=(e.ownerDocument||e).createElement("link"),nt(r);var o=r;return o._p=new Promise(function(i,u){o.onload=i,o.onerror=u}),pt(r,"link",n),t.state.loading|=4,$u(r,a.precedence,e),t.instance=r;case"script":return r=lo(a.src),(l=e.querySelector(ki(r)))?(t.instance=l,nt(l),l):(n=a,(l=ca.get(r))&&(n=Be({},a),Op(n,l)),e=e.ownerDocument||e,l=e.createElement("script"),nt(l),pt(l,"link",n),e.head.appendChild(l),t.instance=l);case"void":return null;default:throw Error(M(443,t.type))}else t.type==="stylesheet"&&(t.state.loading&4)===0&&(n=t.instance,t.state.loading|=4,$u(n,a.precedence,e));return t.instance}function $u(e,t,a){for(var n=a.querySelectorAll('link[rel="stylesheet"][data-precedence],style[data-precedence]'),l=n.length?n[n.length-1]:null,r=l,o=0;o<n.length;o++){var i=n[o];if(i.dataset.precedence===t)r=i;else if(r!==l)break}r?r.parentNode.insertBefore(e,r.nextSibling):(t=a.nodeType===9?a.head:a,t.insertBefore(e,t.firstChild))}function Rp(e,t){e.crossOrigin==null&&(e.crossOrigin=t.crossOrigin),e.referrerPolicy==null&&(e.referrerPolicy=t.referrerPolicy),e.title==null&&(e.title=t.title)}function Op(e,t){e.crossOrigin==null&&(e.crossOrigin=t.crossOrigin),e.referrerPolicy==null&&(e.referrerPolicy=t.referrerPolicy),e.integrity==null&&(e.integrity=t.integrity)}var es=null;function Dx(e,t,a){if(es===null){var n=new Map,l=es=new Map;l.set(a,n)}else l=es,n=l.get(a),n||(n=new Map,l.set(a,n));if(n.has(e))return n;for(n.set(e,null),a=a.getElementsByTagName(e),l=0;l<a.length;l++){var r=a[l];if(!(r[xi]||r[ct]||e==="link"&&r.getAttribute("rel")==="stylesheet")&&r.namespaceURI!=="http://www.w3.org/2000/svg"){var o=r.getAttribute(t)||"";o=e+o;var i=n.get(o);i?i.push(r):n.set(o,[r])}}return n}function Mx(e,t,a){e=e.ownerDocument||e,e.head.insertBefore(a,t==="title"?e.querySelector("head > title"):null)}function jk(e,t,a){if(a===1||t.itemProp!=null)return!1;switch(e){case"meta":case"title":return!0;case"style":if(typeof t.precedence!="string"||typeof t.href!="string"||t.href==="")break;return!0;case"link":if(typeof t.rel!="string"||typeof t.href!="string"||t.href===""||t.onLoad||t.onError)break;switch(t.rel){case"stylesheet":return e=t.disabled,typeof t.precedence=="string"&&e==null;default:return!0}case"script":if(t.async&&typeof t.async!="function"&&typeof t.async!="symbol"&&!t.onLoad&&!t.onError&&t.src&&typeof t.src=="string")return!0}return!1}function hb(e){return!(e.type==="stylesheet"&&(e.state.loading&3)===0)}function Xk(e,t,a,n){if(a.type==="stylesheet"&&(typeof n.media!="string"||matchMedia(n.media).matches!==!1)&&(a.state.loading&4)===0){if(a.instance===null){var l=Zr(n.href),r=t.querySelector(Si(l));if(r){t=r._p,t!==null&&typeof t=="object"&&typeof t.then=="function"&&(e.count++,e=Ts.bind(e),t.then(e,e)),a.state.loading|=4,a.instance=r,nt(r);return}r=t.ownerDocument||t,n=mb(n),(l=ca.get(l))&&Rp(n,l),r=r.createElement("link"),nt(r);var o=r;o._p=new Promise(function(i,u){o.onload=i,o.onerror=u}),pt(r,"link",n),a.instance=r}e.stylesheets===null&&(e.stylesheets=new Map),e.stylesheets.set(a,t),(t=a.state.preload)&&(a.state.loading&3)===0&&(e.count++,a=Ts.bind(e),t.addEventListener("load",a),t.addEventListener("error",a))}}var Yf=0;function Qk(e,t){return e.stylesheets&&e.count===0&&ts(e,e.stylesheets),0<e.count||0<e.imgCount?function(a){var n=setTimeout(function(){if(e.stylesheets&&ts(e,e.stylesheets),e.unsuspend){var r=e.unsuspend;e.unsuspend=null,r()}},6e4+t);0<e.imgBytes&&Yf===0&&(Yf=62500*Ak());var l=setTimeout(function(){if(e.waitingForImages=!1,e.count===0&&(e.stylesheets&&ts(e,e.stylesheets),e.unsuspend)){var r=e.unsuspend;e.unsuspend=null,r()}},(e.imgBytes>Yf?50:800)+t);return e.unsuspend=a,function(){e.unsuspend=null,clearTimeout(n),clearTimeout(l)}}:null}function Ts(){if(this.count--,this.count===0&&(this.imgCount===0||!this.waitingForImages)){if(this.stylesheets)ts(this,this.stylesheets);else if(this.unsuspend){var e=this.unsuspend;this.unsuspend=null,e()}}}var Ds=null;function ts(e,t){e.stylesheets=null,e.unsuspend!==null&&(e.count++,Ds=new Map,t.forEach(Yk,e),Ds=null,Ts.call(e))}function Yk(e,t){if(!(t.state.loading&4)){var a=Ds.get(e);if(a)var n=a.get(null);else{a=new Map,Ds.set(e,a);for(var l=e.querySelectorAll("link[data-precedence],style[data-precedence]"),r=0;r<l.length;r++){var o=l[r];(o.nodeName==="LINK"||o.getAttribute("media")!=="not all")&&(a.set(o.dataset.precedence,o),n=o)}n&&a.set(null,n)}l=t.instance,o=l.getAttribute("data-precedence"),r=a.get(o)||n,r===n&&a.set(null,l),a.set(o,l),this.count++,n=Ts.bind(this),l.addEventListener("load",n),l.addEventListener("error",n),r?r.parentNode.insertBefore(l,r.nextSibling):(e=e.nodeType===9?e.head:e,e.insertBefore(l,e.firstChild)),t.state.loading|=4}}var ci={$$typeof:an,Provider:null,Consumer:null,_currentValue:Sl,_currentValue2:Sl,_threadCount:0};function Kk(e,t,a,n,l,r,o,i,u){this.tag=1,this.containerInfo=e,this.pingCache=this.current=this.pendingChildren=null,this.timeoutHandle=-1,this.callbackNode=this.next=this.pendingContext=this.context=this.cancelPendingCommit=null,this.callbackPriority=0,this.expirationTimes=Lf(-1),this.entangledLanes=this.shellSuspendCounter=this.errorRecoveryDisabledLanes=this.expiredLanes=this.warmLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0,this.entanglements=Lf(0),this.hiddenUpdates=Lf(null),this.identifierPrefix=n,this.onUncaughtError=l,this.onCaughtError=r,this.onRecoverableError=o,this.pooledCache=null,this.pooledCacheLanes=0,this.formState=u,this.incompleteTransitions=new Map}function gb(e,t,a,n,l,r,o,i,u,c,s,f){return e=new Kk(e,t,a,o,u,c,s,f,i),t=1,r===!0&&(t|=24),r=jt(3,null,null,t),e.current=r,r.stateNode=e,t=ip(),t.refCount++,e.pooledCache=t,t.refCount++,r.memoizedState={element:n,isDehydrated:a,cache:t},cp(r),e}function xb(e){return e?(e=Mr,e):Mr}function yb(e,t,a,n,l,r){l=xb(l),n.context===null?n.context=l:n.pendingContext=l,n=Vn(t),n.payload={element:a},r=r===void 0?null:r,r!==null&&(n.callback=r),a=jn(e,n,t),a!==null&&(Ot(a,e,t),Vo(a,e,t))}function Ex(e,t){if(e=e.memoizedState,e!==null&&e.dehydrated!==null){var a=e.retryLane;e.retryLane=a!==0&&a<t?a:t}}function Np(e,t){Ex(e,t),(e=e.alternate)&&Ex(e,t)}function bb(e){if(e.tag===13||e.tag===31){var t=Nl(e,67108864);t!==null&&Ot(t,e,67108864),Np(e,67108864)}}function zx(e){if(e.tag===13||e.tag===31){var t=Zt();t=Qd(t);var a=Nl(e,t);a!==null&&Ot(a,e,t),Np(e,t)}}var Ms=!0;function Zk(e,t,a,n){var l=$.T;$.T=null;var r=be.p;try{be.p=2,qp(e,t,a,n)}finally{be.p=r,$.T=l}}function Jk(e,t,a,n){var l=$.T;$.T=null;var r=be.p;try{be.p=8,qp(e,t,a,n)}finally{be.p=r,$.T=l}}function qp(e,t,a,n){if(Ms){var l=_d(n);if(l===null)Xf(e,t,n,Es,a),Bx(e,n);else if($k(l,e,t,a,n))n.stopPropagation();else if(Bx(e,n),t&4&&-1<Wk.indexOf(e)){for(;l!==null;){var r=$r(l);if(r!==null)switch(r.tag){case 3:if(r=r.stateNode,r.current.memoizedState.isDehydrated){var o=Ll(r.pendingLanes);if(o!==0){var i=r;for(i.pendingLanes|=2,i.entangledLanes|=2;o;){var u=1<<31-Kt(o);i.entanglements[1]|=u,o&=~u}Ra(r),(ye&6)===0&&(Ls=Qt()+500,Ci(0,!1))}}break;case 31:case 13:i=Nl(r,2),i!==null&&Ot(i,r,2),Vs(),Np(r,2)}if(r=_d(n),r===null&&Xf(e,t,n,Es,a),r===l)break;l=r}l!==null&&n.stopPropagation()}else Xf(e,t,n,null,a)}}function _d(e){return e=Jd(e),Up(e)}var Es=null;function Up(e){if(Es=null,e=kr(e),e!==null){var t=pi(e);if(t===null)e=null;else{var a=t.tag;if(a===13){if(e=Fx(t),e!==null)return e;e=null}else if(a===31){if(e=Px(t),e!==null)return e;e=null}else if(a===3){if(t.stateNode.current.memoizedState.isDehydrated)return t.tag===3?t.stateNode.containerInfo:null;e=null}else t!==e&&(e=null)}}return Es=e,null}function Lb(e){switch(e){case"beforetoggle":case"cancel":case"click":case"close":case"contextmenu":case"copy":case"cut":case"auxclick":case"dblclick":case"dragend":case"dragstart":case"drop":case"focusin":case"focusout":case"input":case"invalid":case"keydown":case"keypress":case"keyup":case"mousedown":case"mouseup":case"paste":case"pause":case"play":case"pointercancel":case"pointerdown":case"pointerup":case"ratechange":case"reset":case"resize":case"seeked":case"submit":case"toggle":case"touchcancel":case"touchend":case"touchstart":case"volumechange":case"change":case"selectionchange":case"textInput":case"compositionstart":case"compositionend":case"compositionupdate":case"beforeblur":case"afterblur":case"beforeinput":case"blur":case"fullscreenchange":case"focus":case"hashchange":case"popstate":case"select":case"selectstart":return 2;case"drag":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"mousemove":case"mouseout":case"mouseover":case"pointermove":case"pointerout":case"pointerover":case"scroll":case"touchmove":case"wheel":case"mouseenter":case"mouseleave":case"pointerenter":case"pointerleave":return 8;case"message":switch(FC()){case Vx:return 2;case jx:return 8;case os:case PC:return 32;case Xx:return 268435456;default:return 32}default:return 32}}var Gd=!1,Yn=null,Kn=null,Zn=null,fi=new Map,di=new Map,Nn=[],Wk="mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");function Bx(e,t){switch(e){case"focusin":case"focusout":Yn=null;break;case"dragenter":case"dragleave":Kn=null;break;case"mouseover":case"mouseout":Zn=null;break;case"pointerover":case"pointerout":fi.delete(t.pointerId);break;case"gotpointercapture":case"lostpointercapture":di.delete(t.pointerId)}}function Bo(e,t,a,n,l,r){return e===null||e.nativeEvent!==r?(e={blockedOn:t,domEventName:a,eventSystemFlags:n,nativeEvent:r,targetContainers:[l]},t!==null&&(t=$r(t),t!==null&&bb(t)),e):(e.eventSystemFlags|=n,t=e.targetContainers,l!==null&&t.indexOf(l)===-1&&t.push(l),e)}function $k(e,t,a,n,l){switch(t){case"focusin":return Yn=Bo(Yn,e,t,a,n,l),!0;case"dragenter":return Kn=Bo(Kn,e,t,a,n,l),!0;case"mouseover":return Zn=Bo(Zn,e,t,a,n,l),!0;case"pointerover":var r=l.pointerId;return fi.set(r,Bo(fi.get(r)||null,e,t,a,n,l)),!0;case"gotpointercapture":return r=l.pointerId,di.set(r,Bo(di.get(r)||null,e,t,a,n,l)),!0}return!1}function vb(e){var t=kr(e.target);if(t!==null){var a=pi(t);if(a!==null){if(t=a.tag,t===13){if(t=Fx(a),t!==null){e.blockedOn=t,gg(e.priority,function(){zx(a)});return}}else if(t===31){if(t=Px(a),t!==null){e.blockedOn=t,gg(e.priority,function(){zx(a)});return}}else if(t===3&&a.stateNode.current.memoizedState.isDehydrated){e.blockedOn=a.tag===3?a.stateNode.containerInfo:null;return}}}e.blockedOn=null}function as(e){if(e.blockedOn!==null)return!1;for(var t=e.targetContainers;0<t.length;){var a=_d(e.nativeEvent);if(a===null){a=e.nativeEvent;var n=new a.constructor(a.type,a);id=n,a.target.dispatchEvent(n),id=null}else return t=$r(a),t!==null&&bb(t),e.blockedOn=a,!1;t.shift()}return!0}function Rx(e,t,a){as(e)&&a.delete(t)}function ew(){Gd=!1,Yn!==null&&as(Yn)&&(Yn=null),Kn!==null&&as(Kn)&&(Kn=null),Zn!==null&&as(Zn)&&(Zn=null),fi.forEach(Rx),di.forEach(Rx)}function Pu(e,t){e.blockedOn===t&&(e.blockedOn=null,Gd||(Gd=!0,$e.unstable_scheduleCallback($e.unstable_NormalPriority,ew)))}var Hu=null;function Ox(e){Hu!==e&&(Hu=e,$e.unstable_scheduleCallback($e.unstable_NormalPriority,function(){Hu===e&&(Hu=null);for(var t=0;t<e.length;t+=3){var a=e[t],n=e[t+1],l=e[t+2];if(typeof n!="function"){if(Up(n||a)===null)continue;break}var r=$r(a);r!==null&&(e.splice(t,3),t-=3,Sd(r,{pending:!0,data:l,method:a.method,action:n},n,l))}}))}function Jr(e){function t(u){return Pu(u,e)}Yn!==null&&Pu(Yn,e),Kn!==null&&Pu(Kn,e),Zn!==null&&Pu(Zn,e),fi.forEach(t),di.forEach(t);for(var a=0;a<Nn.length;a++){var n=Nn[a];n.blockedOn===e&&(n.blockedOn=null)}for(;0<Nn.length&&(a=Nn[0],a.blockedOn===null);)vb(a),a.blockedOn===null&&Nn.shift();if(a=(e.ownerDocument||e).$$reactFormReplay,a!=null)for(n=0;n<a.length;n+=3){var l=a[n],r=a[n+1],o=l[Nt]||null;if(typeof r=="function")o||Ox(a);else if(o){var i=null;if(r&&r.hasAttribute("formAction")){if(l=r,o=r[Nt]||null)i=o.formAction;else if(Up(l)!==null)continue}else i=o.action;typeof i=="function"?a[n+1]=i:(a.splice(n,3),n-=3),Ox(a)}}}function Cb(){function e(r){r.canIntercept&&r.info==="react-transition"&&r.intercept({handler:function(){return new Promise(function(o){return l=o})},focusReset:"manual",scroll:"manual"})}function t(){l!==null&&(l(),l=null),n||setTimeout(a,20)}function a(){if(!n&&!navigation.transition){var r=navigation.currentEntry;r&&r.url!=null&&navigation.navigate(r.url,{state:r.getState(),info:"react-transition",history:"replace"})}}if(typeof navigation=="object"){var n=!1,l=null;return navigation.addEventListener("navigate",e),navigation.addEventListener("navigatesuccess",t),navigation.addEventListener("navigateerror",t),setTimeout(a,100),function(){n=!0,navigation.removeEventListener("navigate",e),navigation.removeEventListener("navigatesuccess",t),navigation.removeEventListener("navigateerror",t),l!==null&&(l(),l=null)}}}function Fp(e){this._internalRoot=e}Qs.prototype.render=Fp.prototype.render=function(e){var t=this._internalRoot;if(t===null)throw Error(M(409));var a=t.current,n=Zt();yb(a,n,e,t,null,null)};Qs.prototype.unmount=Fp.prototype.unmount=function(){var e=this._internalRoot;if(e!==null){this._internalRoot=null;var t=e.containerInfo;yb(e.current,2,null,e,null,null),Vs(),t[Wr]=null}};function Qs(e){this._internalRoot=e}Qs.prototype.unstable_scheduleHydration=function(e){if(e){var t=Jx();e={blockedOn:null,target:e,priority:t};for(var a=0;a<Nn.length&&t!==0&&t<Nn[a].priority;a++);Nn.splice(a,0,e),a===0&&vb(e)}};var Nx=qx.version;if(Nx!=="19.2.3")throw Error(M(527,Nx,"19.2.3"));be.findDOMNode=function(e){var t=e._reactInternals;if(t===void 0)throw typeof e.render=="function"?Error(M(188)):(e=Object.keys(e).join(","),Error(M(268,e)));return e=zC(t),e=e!==null?Hx(e):null,e=e===null?null:e.stateNode,e};var tw={bundleType:0,version:"19.2.3",rendererPackageName:"react-dom",currentDispatcherRef:$,reconcilerVersion:"19.2.3"};if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<"u"&&(Ro=__REACT_DEVTOOLS_GLOBAL_HOOK__,!Ro.isDisabled&&Ro.supportsFiber))try{mi=Ro.inject(tw),Yt=Ro}catch{}var Ro;Ys.createRoot=function(e,t){if(!Ux(e))throw Error(M(299));var a=!1,n="",l=p1,r=m1,o=h1;return t!=null&&(t.unstable_strictMode===!0&&(a=!0),t.identifierPrefix!==void 0&&(n=t.identifierPrefix),t.onUncaughtError!==void 0&&(l=t.onUncaughtError),t.onCaughtError!==void 0&&(r=t.onCaughtError),t.onRecoverableError!==void 0&&(o=t.onRecoverableError)),t=gb(e,1,!1,null,null,a,n,null,l,r,o,Cb),e[Wr]=t.current,Bp(e),new Fp(t)};Ys.hydrateRoot=function(e,t,a){if(!Ux(e))throw Error(M(299));var n=!1,l="",r=p1,o=m1,i=h1,u=null;return a!=null&&(a.unstable_strictMode===!0&&(n=!0),a.identifierPrefix!==void 0&&(l=a.identifierPrefix),a.onUncaughtError!==void 0&&(r=a.onUncaughtError),a.onCaughtError!==void 0&&(o=a.onCaughtError),a.onRecoverableError!==void 0&&(i=a.onRecoverableError),a.formState!==void 0&&(u=a.formState)),t=gb(e,1,!0,t,a??null,n,l,u,r,o,i,Cb),t.context=xb(null),a=t.current,n=Zt(),n=Qd(n),l=Vn(n),l.callback=null,jn(a,l,n),a=n,t.current.lanes=a,gi(t,a),Ra(t),e[Wr]=t.current,Bp(e),new Qs(t)};Ys.version="19.2.3"});var Ib=wt((IM,wb)=>{"use strict";function kb(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(kb)}catch(e){console.error(e)}}kb(),wb.exports=Sb()});var Bb=wt(Ws=>{"use strict";var mI=Symbol.for("react.transitional.element"),hI=Symbol.for("react.fragment");function zb(e,t,a){var n=null;if(a!==void 0&&(n=""+a),t.key!==void 0&&(n=""+t.key),"key"in t){a={};for(var l in t)l!=="key"&&(a[l]=t[l])}else a=t;return t=a.ref,{$$typeof:mI,type:e,key:n,ref:t!==void 0?t:null,props:a}}Ws.Fragment=hI;Ws.jsx=zb;Ws.jsxs=zb});var Le=wt((y3,Rb)=>{"use strict";Rb.exports=Bb()});var Kb=wt((MR,Yb)=>{"use strict";var Vb=/\/\*[^*]*\*+([^/*][^*]*\*+)*\//g,wI=/\n/g,II=/^\s*/,AI=/^(\*?[-#/*\\\w]+(\[[0-9a-z_-]+\])?)\s*/,TI=/^:\s*/,DI=/^((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^)]*?\)|[^};])+)/,MI=/^[;\s]*/,EI=/^\s+|\s+$/g,zI=`
`,jb="/",Xb="*",Zl="",BI="comment",RI="declaration";function OI(e,t){if(typeof e!="string")throw new TypeError("First argument must be a string");if(!e)return[];t=t||{};var a=1,n=1;function l(h){var y=h.match(wI);y&&(a+=y.length);var k=h.lastIndexOf(zI);n=~k?h.length-k:n+h.length}function r(){var h={line:a,column:n};return function(y){return y.position=new o(h),c(),y}}function o(h){this.start=h,this.end={line:a,column:n},this.source=t.source}o.prototype.content=e;function i(h){var y=new Error(t.source+":"+a+":"+n+": "+h);if(y.reason=h,y.filename=t.source,y.line=a,y.column=n,y.source=e,!t.silent)throw y}function u(h){var y=h.exec(e);if(y){var k=y[0];return l(k),e=e.slice(k.length),y}}function c(){u(II)}function s(h){var y;for(h=h||[];y=f();)y!==!1&&h.push(y);return h}function f(){var h=r();if(!(jb!=e.charAt(0)||Xb!=e.charAt(1))){for(var y=2;Zl!=e.charAt(y)&&(Xb!=e.charAt(y)||jb!=e.charAt(y+1));)++y;if(y+=2,Zl===e.charAt(y-1))return i("End of comment missing");var k=e.slice(2,y-2);return n+=2,l(k),e=e.slice(y),n+=2,h({type:BI,comment:k})}}function p(){var h=r(),y=u(AI);if(y){if(f(),!u(TI))return i("property missing ':'");var k=u(DI),g=h({type:RI,property:Qb(y[0].replace(Vb,Zl)),value:k?Qb(k[0].replace(Vb,Zl)):Zl});return u(MI),g}}function d(){var h=[];s(h);for(var y;y=p();)y!==!1&&(h.push(y),s(h));return h}return c(),d()}function Qb(e){return e?e.replace(EI,Zl):Zl}Yb.exports=OI});var Zb=wt($i=>{"use strict";var NI=$i&&$i.__importDefault||function(e){return e&&e.__esModule?e:{default:e}};Object.defineProperty($i,"__esModule",{value:!0});$i.default=UI;var qI=NI(Kb());function UI(e,t){let a=null;if(!e||typeof e!="string")return a;let n=(0,qI.default)(e),l=typeof t=="function";return n.forEach(r=>{if(r.type!=="declaration")return;let{property:o,value:i}=r;l?t(o,i,r):i&&(a=a||{},a[o]=i)}),a}});var Wb=wt(lc=>{"use strict";Object.defineProperty(lc,"__esModule",{value:!0});lc.camelCase=void 0;var FI=/^--[a-zA-Z0-9_-]+$/,PI=/-([a-z])/g,HI=/^[^-]+$/,_I=/^-(webkit|moz|ms|o|khtml)-/,GI=/^-(ms)-/,VI=function(e){return!e||HI.test(e)||FI.test(e)},jI=function(e,t){return t.toUpperCase()},Jb=function(e,t){return"".concat(t,"-")},XI=function(e,t){return t===void 0&&(t={}),VI(e)?e:(e=e.toLowerCase(),t.reactCompat?e=e.replace(GI,Jb):e=e.replace(_I,Jb),e.replace(PI,jI))};lc.camelCase=XI});var eL=wt((Wp,$b)=>{"use strict";var QI=Wp&&Wp.__importDefault||function(e){return e&&e.__esModule?e:{default:e}},YI=QI(Zb()),KI=Wb();function Jp(e,t){var a={};return!e||typeof e!="string"||(0,YI.default)(e,function(n,l){n&&l&&(a[(0,KI.camelCase)(n,t)]=l)}),a}Jp.default=Jp;$b.exports=Jp});var wv=wt((dq,kv)=>{"use strict";var Tc=Object.prototype.hasOwnProperty,Sv=Object.prototype.toString,xv=Object.defineProperty,yv=Object.getOwnPropertyDescriptor,bv=function(t){return typeof Array.isArray=="function"?Array.isArray(t):Sv.call(t)==="[object Array]"},Lv=function(t){if(!t||Sv.call(t)!=="[object Object]")return!1;var a=Tc.call(t,"constructor"),n=t.constructor&&t.constructor.prototype&&Tc.call(t.constructor.prototype,"isPrototypeOf");if(t.constructor&&!a&&!n)return!1;var l;for(l in t);return typeof l>"u"||Tc.call(t,l)},vv=function(t,a){xv&&a.name==="__proto__"?xv(t,a.name,{enumerable:!0,configurable:!0,value:a.newValue,writable:!0}):t[a.name]=a.newValue},Cv=function(t,a){if(a==="__proto__")if(Tc.call(t,a)){if(yv)return yv(t,a).value}else return;return t[a]};kv.exports=function e(){var t,a,n,l,r,o,i=arguments[0],u=1,c=arguments.length,s=!1;for(typeof i=="boolean"&&(s=i,i=arguments[1]||{},u=2),(i==null||typeof i!="object"&&typeof i!="function")&&(i={});u<c;++u)if(t=arguments[u],t!=null)for(a in t)n=Cv(i,a),l=Cv(t,a),i!==l&&(s&&l&&(Lv(l)||(r=bv(l)))?(r?(r=!1,o=n&&bv(n)?n:[]):o=n&&Lv(n)?n:{},vv(i,{name:a,newValue:e(s,o,l)})):typeof l<"u"&&vv(i,{name:a,newValue:l}));return i}});var Z0=W(_e(),1),J0=W(Ib(),1);var Aa=W(_e(),1);var Zs=W(_e());var Ab=e=>e.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),aw=e=>e.replace(/^([A-Z])|[\s-_]+(\w)/g,(t,a,n)=>n?n.toUpperCase():a.toLowerCase()),Pp=e=>{let t=aw(e);return t.charAt(0).toUpperCase()+t.slice(1)},Ks=(...e)=>e.filter((t,a,n)=>!!t&&t.trim()!==""&&n.indexOf(t)===a).join(" ").trim(),Tb=e=>{for(let t in e)if(t.startsWith("aria-")||t==="role"||t==="title")return!0};var wi=W(_e());var Db={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};var Mb=(0,wi.forwardRef)(({color:e="currentColor",size:t=24,strokeWidth:a=2,absoluteStrokeWidth:n,className:l="",children:r,iconNode:o,...i},u)=>(0,wi.createElement)("svg",{ref:u,...Db,width:t,height:t,stroke:e,strokeWidth:n?Number(a)*24/Number(t):a,className:Ks("lucide",l),...!r&&!Tb(i)&&{"aria-hidden":"true"},...i},[...o.map(([c,s])=>(0,wi.createElement)(c,s)),...Array.isArray(r)?r:[r]]));var A=(e,t)=>{let a=(0,Zs.forwardRef)(({className:n,...l},r)=>(0,Zs.createElement)(Mb,{ref:r,iconNode:t,className:Ks(`lucide-${Ab(Pp(e))}`,`lucide-${e}`,n),...l}));return a.displayName=Pp(e),a};var nw=[["path",{d:"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",key:"169zse"}]],Ut=A("activity",nw);var lw=[["rect",{width:"20",height:"5",x:"2",y:"3",rx:"1",key:"1wp1u1"}],["path",{d:"M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8",key:"1s80jp"}],["path",{d:"M10 12h4",key:"a56b0p"}]],Ii=A("archive",lw);var rw=[["path",{d:"M12 5v14",key:"s699le"}],["path",{d:"m19 12-7 7-7-7",key:"1idqje"}]],Ai=A("arrow-down",rw);var ow=[["path",{d:"M7 7h10v10",key:"1tivn9"}],["path",{d:"M7 17 17 7",key:"1vkiza"}]],fa=A("arrow-up-right",ow);var iw=[["path",{d:"m5 12 7-7 7 7",key:"hav0vg"}],["path",{d:"M12 19V5",key:"x0mq9r"}]],Ul=A("arrow-up",iw);var uw=[["path",{d:"M12 7v14",key:"1akyts"}],["path",{d:"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",key:"ruj8y"}]],Oa=A("book-open",uw);var sw=[["path",{d:"M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z",key:"l5xja"}],["path",{d:"M9 13a4.5 4.5 0 0 0 3-4",key:"10igwf"}],["path",{d:"M6.003 5.125A3 3 0 0 0 6.401 6.5",key:"105sqy"}],["path",{d:"M3.477 10.896a4 4 0 0 1 .585-.396",key:"ql3yin"}],["path",{d:"M6 18a4 4 0 0 1-1.967-.516",key:"2e4loj"}],["path",{d:"M12 13h4",key:"1ku699"}],["path",{d:"M12 18h6a2 2 0 0 1 2 2v1",key:"105ag5"}],["path",{d:"M12 8h8",key:"1lhi5i"}],["path",{d:"M16 8V5a2 2 0 0 1 2-2",key:"u6izg6"}],["circle",{cx:"16",cy:"13",r:".5",key:"ry7gng"}],["circle",{cx:"18",cy:"3",r:".5",key:"1aiba7"}],["circle",{cx:"20",cy:"21",r:".5",key:"yhc1fs"}],["circle",{cx:"20",cy:"8",r:".5",key:"1e43v0"}]],Ti=A("brain-circuit",sw);var cw=[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]],Ft=A("check",cw);var fw=[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]],Di=A("chevron-down",fw);var dw=[["path",{d:"m15 18-6-6 6-6",key:"1wnfg3"}]],Mi=A("chevron-left",dw);var pw=[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]],Fl=A("chevron-right",pw);var mw=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12",key:"1pkeuh"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16",key:"4dfq90"}]],nl=A("circle-alert",mw);var hw=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}]],Ei=A("circle",hw);var gw=[["path",{d:"M12 6v6h4",key:"135r8i"}],["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}]],zi=A("clock-3",gw);var xw=[["path",{d:"m18 16 4-4-4-4",key:"1inbqp"}],["path",{d:"m6 8-4 4 4 4",key:"15zrgr"}],["path",{d:"m14.5 4-5 16",key:"e7oirm"}]],ll=A("code-xml",xw);var yw=[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]],Pl=A("copy",yw);var bw=[["path",{d:"M20 4v7a4 4 0 0 1-4 4H4",key:"6o5b7l"}],["path",{d:"m9 10-5 5 5 5",key:"1kshq7"}]],Bi=A("corner-down-left",bw);var Lw=[["path",{d:"M12 15V3",key:"m9g1x1"}],["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["path",{d:"m7 10 5 5 5-5",key:"brsn70"}]],rl=A("download",Lw);var vw=[["circle",{cx:"12",cy:"12",r:"1",key:"41hilf"}],["circle",{cx:"19",cy:"12",r:"1",key:"1wjl8i"}],["circle",{cx:"5",cy:"12",r:"1",key:"1pcz8c"}]],Na=A("ellipsis",vw);var Cw=[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"M10 14 21 3",key:"gplh6r"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",key:"a6xqqp"}]],Hl=A("external-link",Cw);var Sw=[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",key:"1nclc0"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]],ro=A("eye",Sw);var kw=[["path",{d:"M4 12.15V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3.35",key:"1wthlu"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["path",{d:"m5 16-3 3 3 3",key:"331omg"}],["path",{d:"m9 22 3-3-3-3",key:"lsp7cz"}]],qa=A("file-code-corner",kw);var ww=[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",key:"1oefj6"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["path",{d:"M8 13h2",key:"yr2amv"}],["path",{d:"M14 13h2",key:"un5t4a"}],["path",{d:"M8 17h2",key:"2yhykz"}],["path",{d:"M14 17h2",key:"10kma7"}]],Ri=A("file-spreadsheet",ww);var Iw=[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",key:"1oefj6"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]],je=A("file-text",Iw);var Aw=[["path",{d:"m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",key:"usdka0"}]],Oi=A("folder-open",Aw);var Tw=[["path",{d:"M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z",key:"sc7q7i"}]],ol=A("funnel",Tw);var Dw=[["line",{x1:"6",x2:"6",y1:"3",y2:"15",key:"17qcm7"}],["circle",{cx:"18",cy:"6",r:"3",key:"1h7g24"}],["circle",{cx:"6",cy:"18",r:"3",key:"fqmcym"}],["path",{d:"M18 9a9 9 0 0 1-9 9",key:"n2h4wq"}]],hn=A("git-branch",Dw);var Mw=[["path",{d:"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z",key:"j76jl0"}],["path",{d:"M22 10v6",key:"1lu8f3"}],["path",{d:"M6 12.5V16a6 3 0 0 0 12 0v-3.5",key:"1r8lef"}]],_l=A("graduation-cap",Mw);var Ew=[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}],["path",{d:"M12 7v5l4 2",key:"1fdv2h"}]],Ni=A("history",Ew);var zw=[["path",{d:"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z",key:"zw3jo"}],["path",{d:"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12",key:"1wduqc"}],["path",{d:"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17",key:"kqbvx6"}]],da=A("layers",zw);var Bw=[["path",{d:"M13 5h8",key:"a7qcls"}],["path",{d:"M13 12h8",key:"h98zly"}],["path",{d:"M13 19h8",key:"c3s6r1"}],["path",{d:"m3 17 2 2 4-4",key:"1jhpwq"}],["rect",{x:"3",y:"4",width:"6",height:"6",rx:"1",key:"cif1o7"}]],Ua=A("list-todo",Bw);var Rw=[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]],Dt=A("loader-circle",Rw);var Ow=[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"m21 3-7 7",key:"1l2asr"}],["path",{d:"m3 21 7-7",key:"tjx5ai"}],["path",{d:"M9 21H3v-6",key:"wtvkvv"}]],Gl=A("maximize-2",Ow);var Nw=[["path",{d:"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",key:"18887p"}]],gn=A("message-square",Nw);var qw=[["path",{d:"m14 10 7-7",key:"oa77jy"}],["path",{d:"M20 10h-6V4",key:"mjg0md"}],["path",{d:"m3 21 7-7",key:"tjx5ai"}],["path",{d:"M4 14h6v6",key:"rmj7iw"}]],Vl=A("minimize-2",qw);var Uw=[["rect",{width:"20",height:"14",x:"2",y:"3",rx:"2",key:"48i651"}],["line",{x1:"8",x2:"16",y1:"21",y2:"21",key:"1svkeh"}],["line",{x1:"12",x2:"12",y1:"17",y2:"21",key:"vw1qmm"}]],qi=A("monitor",Uw);var Fw=[["path",{d:"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401",key:"kfwtm"}]],Ui=A("moon",Fw);var Pw=[["path",{d:"M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z",key:"edeuup"}]],Fi=A("mouse-pointer-2",Pw);var Hw=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M9 3v18",key:"fh3hqa"}],["path",{d:"m16 15-3-3 3-3",key:"14y99z"}]],il=A("panel-left-close",Hw);var _w=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M9 3v18",key:"fh3hqa"}]],xn=A("panel-left",_w);var Gw=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M15 3v18",key:"14nvp0"}]],jl=A("panel-right",Gw);var Vw=[["path",{d:"m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551",key:"1miecu"}]],ul=A("paperclip",Vw);var jw=[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}],["path",{d:"m15 5 4 4",key:"1mk7zo"}]],yn=A("pencil",jw);var Xw=[["path",{d:"M12 17v5",key:"bb1du9"}],["path",{d:"M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z",key:"1nkz8b"}]],oo=A("pin",Xw);var Qw=[["path",{d:"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z",key:"10ikf1"}]],bn=A("play",Qw);var Yw=[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"M12 5v14",key:"s699le"}]],Fa=A("plus",Yw);var Kw=[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]],Pi=A("refresh-cw",Kw);var Zw=[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}]],Ln=A("rotate-ccw",Zw);var Jw=[["path",{d:"m21 21-4.34-4.34",key:"14j7rj"}],["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}]],pa=A("search",Jw);var Ww=[["path",{d:"M14 17H5",key:"gfn3mx"}],["path",{d:"M19 7h-9",key:"6i9tg"}],["circle",{cx:"17",cy:"17",r:"3",key:"18b49y"}],["circle",{cx:"7",cy:"7",r:"3",key:"dfmy0x"}]],Hi=A("settings-2",Ww);var $w=[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]],io=A("shield-check",$w);var eI=[["path",{d:"M10 5H3",key:"1qgfaw"}],["path",{d:"M12 19H3",key:"yhmn1j"}],["path",{d:"M14 3v4",key:"1sua03"}],["path",{d:"M16 17v4",key:"1q0r14"}],["path",{d:"M21 12h-9",key:"1o4lsq"}],["path",{d:"M21 19h-5",key:"1rlt1p"}],["path",{d:"M21 5h-7",key:"1oszz2"}],["path",{d:"M8 10v4",key:"tgpxqk"}],["path",{d:"M8 12H3",key:"a7s4jb"}]],Xl=A("sliders-horizontal",eI);var tI=[["path",{d:"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",key:"1s2grr"}],["path",{d:"M20 2v4",key:"1rf3ol"}],["path",{d:"M22 4h-4",key:"gwowj6"}],["circle",{cx:"4",cy:"20",r:"2",key:"6kqj1y"}]],Ca=A("sparkles",tI);var aI=[["path",{d:"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7",key:"1m0v6g"}],["path",{d:"M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z",key:"ohrbg2"}]],bt=A("square-pen",aI);var nI=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}]],vn=A("square",nI);var lI=[["circle",{cx:"12",cy:"12",r:"4",key:"4exip2"}],["path",{d:"M12 2v2",key:"tus03m"}],["path",{d:"M12 20v2",key:"1lh1kg"}],["path",{d:"m4.93 4.93 1.41 1.41",key:"149t6j"}],["path",{d:"m17.66 17.66 1.41 1.41",key:"ptbguv"}],["path",{d:"M2 12h2",key:"1t8f8n"}],["path",{d:"M20 12h2",key:"1q8mjw"}],["path",{d:"m6.34 17.66-1.41 1.41",key:"1m8zz5"}],["path",{d:"m19.07 4.93-1.41 1.41",key:"1shlcs"}]],_i=A("sun",lI);var rI=[["path",{d:"M12 19h8",key:"baeox8"}],["path",{d:"m4 17 6-6-6-6",key:"1yngyt"}]],Ql=A("terminal",rI);var oI=[["path",{d:"M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z",key:"m61m77"}],["path",{d:"M17 14V2",key:"8ymqnk"}]],Gi=A("thumbs-down",oI);var iI=[["path",{d:"M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z",key:"emmmcr"}],["path",{d:"M7 10v12",key:"1qc93n"}]],Vi=A("thumbs-up",iI);var uI=[["path",{d:"M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z",key:"uqj9uw"}],["path",{d:"M16 9a5 5 0 0 1 0 6",key:"1q6k2b"}],["path",{d:"M19.364 18.364a9 9 0 0 0 0-12.728",key:"ijwkga"}]],ji=A("volume-2",uI);var sI=[["path",{d:"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72",key:"ul74o6"}],["path",{d:"m14 7 3 3",key:"1r5n42"}],["path",{d:"M5 6v4",key:"ilb8ba"}],["path",{d:"M19 14v4",key:"blhpug"}],["path",{d:"M10 2v2",key:"7u0qdc"}],["path",{d:"M7 8H3",key:"zfb6yr"}],["path",{d:"M21 16h-4",key:"1cnmox"}],["path",{d:"M11 3H9",key:"1obp7u"}]],Pt=A("wand-sparkles",sI);var cI=[["path",{d:"M12 20h.01",key:"zekei9"}],["path",{d:"M8.5 16.429a5 5 0 0 1 7 0",key:"1bycff"}],["path",{d:"M5 12.859a10 10 0 0 1 5.17-2.69",key:"1dl1wf"}],["path",{d:"M19 12.859a10 10 0 0 0-2.007-1.523",key:"4k23kn"}],["path",{d:"M2 8.82a15 15 0 0 1 4.177-2.643",key:"1grhjp"}],["path",{d:"M22 8.82a15 15 0 0 0-11.288-3.764",key:"z3jwby"}],["path",{d:"m2 2 20 20",key:"1ooewy"}]],Xi=A("wifi-off",cI);var fI=[["rect",{width:"8",height:"8",x:"3",y:"3",rx:"2",key:"by2w9f"}],["path",{d:"M7 11v4a2 2 0 0 0 2 2h4",key:"xkn7yn"}],["rect",{width:"8",height:"8",x:"13",y:"13",rx:"2",key:"1cgmvn"}]],sl=A("workflow",fI);var dI=[["path",{d:"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z",key:"1ngwbx"}]],Qi=A("wrench",dI);var pI=[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]],qe=A("x",pI);var uo=W(_e(),1),Hp=(0,uo.createContext)(null);function ue(){let e=(0,uo.useContext)(Hp);if(!e)throw new Error("\u5DE5\u4F5C\u53F0\u672A\u521D\u59CB\u5316");return{controller:e,state:(0,uo.useSyncExternalStore)(e.subscribe,e.snapshot)}}var Zi=W(_e(),1);var Ki=W(_e(),1);var et=e=>["SUCCEEDED","FAILED","CANCELED"].includes(e.status),Js=e=>e.length>0&&e.every(t=>t.type==="material"),Eb={WAITING_INPUT:"\u5F85\u56DE\u7B54",QUEUED:"\u7B49\u5F85\u6267\u884C",RUNNING:"\u6267\u884C\u4E2D",CANCEL_REQUESTED:"\u6B63\u5728\u505C\u6B62",SUCCEEDED:"\u5DF2\u5B8C\u6210",FAILED:"\u672A\u5B8C\u6210",CANCELED:"\u5DF2\u505C\u6B62",NEEDS_REVIEW:"\u5F85\u5BA1\u9605",DRAFT:"\u8349\u7A3F",PUBLISHED:"\u5DF2\u53D1\u5E03",GENERATING:"\u751F\u6210\u4E2D",completed:"\u5DF2\u5B8C\u6210",running:"\u6267\u884C\u4E2D",failed:"\u672A\u5B8C\u6210",cancelled:"\u5DF2\u505C\u6B62",incomplete:"\u8BB0\u5F55\u4E0D\u5B8C\u6574"},Yi={"learning-flow":"\u6D41\u7A0B\u63A2\u7A76\u5F0F\u5B66\u4E60",simulation:"\u4EA4\u4E92\u6F14\u793A","slide-deck":"\u8BFE\u4EF6","question-set":"\u5B9E\u8DF5\u9898","lesson-plan":"\u6559\u6848","attack-defense-scene":"\u653B\u9632\u6F14\u793A",debate:"AI \u8FA9\u8BBA",assessment:"\u8BC4\u5206\u65B9\u6848","learning-path":"\u5B66\u4E60\u8DEF\u5F84","agent.chat":"\u667A\u80FD\u4F53\u4EFB\u52A1","artifact.revise":"\u5C40\u90E8\u4FEE\u6539","candidate.generate":"\u751F\u6210\u5185\u5BB9"};function Cn(e){if(!e)return"";let t=new Date(e.endsWith("Z")||/[+-]\d\d:\d\d$/.test(e)?e:e+"Z");return Number.isNaN(t.getTime())?"":t.toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}var mt=W(Le(),1);function P({children:e,label:t,className:a="",...n}){return(0,mt.jsx)("button",{type:"button",className:`button ${a}`,"aria-label":t,title:t,...n,children:e})}function Y(e){return(0,mt.jsx)(P,{...e,className:`icon-button ${e.className||""}`})}function $t({status:e}){let t=["running","RUNNING","QUEUED","CANCEL_REQUESTED","GENERATING"].includes(e),a=["failed","FAILED","incomplete"].includes(e),n=["completed","SUCCEEDED","PUBLISHED"].includes(e);return(0,mt.jsxs)("span",{className:`status ${t?"running":a?"failed":n?"done":""}`,children:[(0,mt.jsx)(t?Dt:a?nl:n?Ft:Ei,{className:t?"spin":"",size:13}),Eb[e]||e]})}function Pa({icon:e,title:t,children:a}){return(0,mt.jsxs)("div",{className:"empty-state",children:[e,(0,mt.jsx)("strong",{children:t}),a&&(0,mt.jsx)("div",{children:a})]})}function ma({title:e,children:t,onClose:a,wide:n=!1}){let l=(0,Ki.useRef)(null),r=(0,Ki.useRef)(a);return r.current=a,(0,Ki.useEffect)(()=>{let o=l.current.getRootNode(),i=o.activeElement,u=requestAnimationFrame(()=>l.current?.querySelector("[autofocus],input,textarea,button")?.focus()),c=f=>{if(f.key==="Escape"&&(f.stopPropagation(),f.preventDefault(),r.current()),f.key!=="Tab")return;let p=Array.from(l.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')||[]).filter(d=>d.getClientRects().length);if(!p.length){f.preventDefault();return}f.shiftKey&&o.activeElement===p[0]?(f.preventDefault(),p.at(-1)?.focus()):!f.shiftKey&&o.activeElement===p.at(-1)&&(f.preventDefault(),p[0].focus())};l.current?.addEventListener("keydown",c);let s=l.current;return()=>{cancelAnimationFrame(u),s?.removeEventListener("keydown",c),i?.focus()}},[]),(0,mt.jsx)("div",{className:"modal-layer",onMouseDown:o=>{o.target===o.currentTarget&&a()},children:(0,mt.jsxs)("div",{ref:l,className:`dialog ${n?"wide":""}`,role:"dialog","aria-modal":"true","aria-label":e,children:[(0,mt.jsxs)("header",{children:[(0,mt.jsx)("h2",{children:e}),(0,mt.jsx)(Y,{label:"\u5173\u95ED",onClick:a,children:(0,mt.jsx)(qe,{size:17})})]}),t]})})}function Sa({value:e}){let t=typeof e=="string"?e:JSON.stringify(e,null,2);return(0,mt.jsx)("pre",{className:"code",children:(0,mt.jsx)("code",{children:t})})}var X=W(Le(),1);function Ob(){let{state:e,controller:t}=ue(),[a,n]=(0,Zi.useState)(null),[l,r]=(0,Zi.useState)(null),[o,i]=(0,Zi.useState)(""),[u,c]=(0,Zi.useState)(t.storage.value("groupByCourse",!1)),s=e.jobs.filter(p=>!et(p)).length,f=new Map;for(let p of e.threads){let d=e.context.teacherDojos?.find(y=>y.id===p.dojoId),h=p.pinned?"\u7F6E\u9876":u?d?.name||"\u72EC\u7ACB\u521B\u4F5C":"\u6700\u8FD1\u4F1A\u8BDD";f.set(h,[...f.get(h)||[],p])}return(0,X.jsxs)(X.Fragment,{children:[e.sidebarOpen&&(0,X.jsx)("button",{className:"drawer-backdrop","aria-label":"\u5173\u95ED\u5BFC\u822A",onClick:()=>t.patch({sidebarOpen:!1})}),(0,X.jsxs)("aside",{id:"workbench-sidebar",className:`sidebar ${e.sidebarOpen?"open":""}`,"aria-label":"\u4F1A\u8BDD\u5BFC\u822A",children:[(0,X.jsx)(Y,{className:"mobile-only sidebar-close",label:"\u5173\u95ED\u5BFC\u822A",onClick:()=>t.patch({sidebarOpen:!1}),children:(0,X.jsx)(il,{size:17})}),(0,X.jsxs)("div",{className:"sidebar-actions",children:[(0,X.jsxs)(P,{className:"new-thread",onClick:()=>t.newThread(),children:[(0,X.jsx)(bt,{size:17}),"\u65B0\u5EFA\u4F1A\u8BDD",(0,X.jsx)("kbd",{children:"Alt N"})]}),(0,X.jsxs)(P,{className:"thread-search",onClick:()=>t.patch({modal:"search"}),children:[(0,X.jsx)(pa,{size:17}),"\u641C\u7D22\u4E0E\u547D\u4EE4",(0,X.jsx)("kbd",{children:"\u2318 K"})]}),(0,X.jsxs)(P,{className:e.taskCenter?"selected":"",onClick:()=>t.patch({taskCenter:!0,sidebarOpen:!1}),children:[(0,X.jsx)(Ua,{size:17}),"\u4EFB\u52A1\u4E2D\u5FC3",s>0&&(0,X.jsx)("span",{className:"count",children:s})]}),(0,X.jsxs)("a",{className:"button",href:"/teacher/projects",children:[(0,X.jsx)(Oi,{size:17}),"\u5168\u90E8\u6210\u54C1",(0,X.jsx)(fa,{size:14,className:"push"})]})]}),(0,X.jsxs)("div",{className:"sidebar-section-heading",children:[(0,X.jsxs)(P,{onClick:()=>t.filterThreads("",!e.archived),children:[e.archived?"\u5DF2\u5F52\u6863":"\u4F1A\u8BDD",(0,X.jsx)(Di,{size:13})]}),(0,X.jsx)(Y,{label:u?"\u6309\u65F6\u95F4\u6392\u5217":"\u6309\u8BFE\u7A0B\u5206\u7EC4",onClick:()=>{c(!u),t.storage.set("groupByCourse",!u)},children:(0,X.jsx)(_l,{size:16})})]}),(0,X.jsxs)("nav",{className:"thread-list",children:[!e.threads.length&&(0,X.jsx)("p",{className:"quiet sidebar-empty",children:e.archived?"\u6CA1\u6709\u5F52\u6863\u4F1A\u8BDD":"\u5F00\u59CB\u4E00\u6B21\u65B0\u7684\u6559\u5B66\u521B\u4F5C\u3002"}),[...f].map(([p,d])=>(0,X.jsxs)("section",{children:[(0,X.jsx)("h3",{children:p}),d.map(h=>(0,X.jsxs)("div",{className:`thread-row ${e.thread?.id===h.id&&!e.taskCenter?"selected":""}`,children:[(0,X.jsxs)("button",{className:"thread-link",onClick:()=>{n(null),t.activate(h.id).catch(t.error)},title:h.title,children:[h.pinned?(0,X.jsx)(oo,{size:13}):(0,X.jsx)(gn,{size:13}),(0,X.jsxs)("span",{className:"thread-copy",children:[(0,X.jsx)("strong",{children:h.title||"\u65B0\u4F1A\u8BDD"}),h.latestMessage&&(0,X.jsx)("small",{children:h.latestMessage})]}),h.updated&&(0,X.jsx)("time",{title:Cn(h.updated),children:Cn(h.updated).split(" ")[0]}),e.jobs.some(y=>y.threadId===h.id&&!et(y))&&(0,X.jsx)("i",{className:"live-dot"})]}),(0,X.jsx)(Y,{label:`\u7BA1\u7406\u4F1A\u8BDD\uFF1A${h.title}`,className:"thread-more",onClick:()=>n(a===h.id?null:h.id),children:(0,X.jsx)(Na,{size:16})}),a===h.id&&(0,X.jsxs)("div",{className:"thread-menu",role:"menu",children:[(0,X.jsxs)(P,{onClick:()=>{r(h),i(h.title),n(null)},children:[(0,X.jsx)(yn,{size:14}),"\u91CD\u547D\u540D"]}),(0,X.jsxs)(P,{onClick:()=>{n(null),t.run(()=>t.updateThread(h.id,{pinned:!h.pinned}))},children:[(0,X.jsx)(oo,{size:14}),h.pinned?"\u53D6\u6D88\u7F6E\u9876":"\u7F6E\u9876"]}),(0,X.jsxs)(P,{onClick:()=>{n(null),t.run(()=>t.fork(h.id))},children:[(0,X.jsx)(hn,{size:14}),"\u521B\u5EFA\u5206\u652F"]}),(0,X.jsxs)(P,{onClick:()=>{n(null),t.run(()=>t.updateThread(h.id,{archived:h.status!=="ARCHIVED"}))},children:[(0,X.jsx)(Ii,{size:14}),h.status==="ARCHIVED"?"\u6062\u590D\u4F1A\u8BDD":"\u5F52\u6863"]})]})]},h.id))]},p))]})]}),l&&(0,X.jsx)(ma,{title:"\u91CD\u547D\u540D\u4F1A\u8BDD",onClose:()=>r(null),children:(0,X.jsxs)("form",{onSubmit:p=>{p.preventDefault(),t.run(async()=>{await t.updateThread(l.id,{title:o.trim()}),r(null)})},children:[(0,X.jsxs)("label",{className:"field",children:["\u540D\u79F0",(0,X.jsx)("input",{autoFocus:!0,value:o,onChange:p=>i(p.target.value),maxLength:200,required:!0})]}),(0,X.jsxs)("div",{className:"dialog-actions",children:[(0,X.jsx)(P,{onClick:()=>r(null),children:"\u53D6\u6D88"}),(0,X.jsx)("button",{className:"button primary",disabled:!o.trim()||e.busy,children:"\u4FDD\u5B58\u540D\u79F0"})]})]})})]})}var me=W(_e(),1);function Nb(e,t){let a=t||{};return(e[e.length-1]===""?[...e,""]:e).join((a.padRight?" ":"")+","+(a.padLeft===!1?"":" ")).trim()}var gI=/^[$_\p{ID_Start}][$_\u{200C}\u{200D}\p{ID_Continue}]*$/u,xI=/^[$_\p{ID_Start}][-$_\u{200C}\u{200D}\p{ID_Continue}]*$/u,yI={};function $s(e,t){return((t||yI).jsx?xI:gI).test(e)}var bI=/[ \t\n\f\r]/g;function _p(e){return typeof e=="object"?e.type==="text"?qb(e.value):!1:qb(e)}function qb(e){return e.replace(bI,"")===""}var Sn=class{constructor(t,a,n){this.normal=a,this.property=t,n&&(this.space=n)}};Sn.prototype.normal={};Sn.prototype.property={};Sn.prototype.space=void 0;function Gp(e,t){let a={},n={};for(let l of e)Object.assign(a,l.property),Object.assign(n,l.normal);return new Sn(a,n,t)}function Ji(e){return e.toLowerCase()}var rt=class{constructor(t,a){this.attribute=a,this.property=t}};rt.prototype.attribute="";rt.prototype.booleanish=!1;rt.prototype.boolean=!1;rt.prototype.commaOrSpaceSeparated=!1;rt.prototype.commaSeparated=!1;rt.prototype.defined=!1;rt.prototype.mustUseProperty=!1;rt.prototype.number=!1;rt.prototype.overloadedBoolean=!1;rt.prototype.property="";rt.prototype.spaceSeparated=!1;rt.prototype.space=void 0;var Wi={};Nh(Wi,{boolean:()=>ee,booleanish:()=>Pe,commaOrSpaceSeparated:()=>Ht,commaSeparated:()=>kn,number:()=>R,overloadedBoolean:()=>ec,spaceSeparated:()=>ve});var LI=0,ee=Yl(),Pe=Yl(),ec=Yl(),R=Yl(),ve=Yl(),kn=Yl(),Ht=Yl();function Yl(){return 2**++LI}var Vp=Object.keys(Wi),Kl=class extends rt{constructor(t,a,n,l){let r=-1;if(super(t,a),Ub(this,"space",l),typeof n=="number")for(;++r<Vp.length;){let o=Vp[r];Ub(this,Vp[r],(n&Wi[o])===Wi[o])}}};Kl.prototype.defined=!0;function Ub(e,t,a){a&&(e[t]=a)}function ha(e){let t={},a={};for(let[n,l]of Object.entries(e.properties)){let r=new Kl(n,e.transform(e.attributes||{},n),l,e.space);e.mustUseProperty&&e.mustUseProperty.includes(n)&&(r.mustUseProperty=!0),t[n]=r,a[Ji(n)]=n,a[Ji(r.attribute)]=n}return new Sn(t,a,e.space)}var jp=ha({properties:{ariaActiveDescendant:null,ariaAtomic:Pe,ariaAutoComplete:null,ariaBusy:Pe,ariaChecked:Pe,ariaColCount:R,ariaColIndex:R,ariaColSpan:R,ariaControls:ve,ariaCurrent:null,ariaDescribedBy:ve,ariaDetails:null,ariaDisabled:Pe,ariaDropEffect:ve,ariaErrorMessage:null,ariaExpanded:Pe,ariaFlowTo:ve,ariaGrabbed:Pe,ariaHasPopup:null,ariaHidden:Pe,ariaInvalid:null,ariaKeyShortcuts:null,ariaLabel:null,ariaLabelledBy:ve,ariaLevel:R,ariaLive:null,ariaModal:Pe,ariaMultiLine:Pe,ariaMultiSelectable:Pe,ariaOrientation:null,ariaOwns:ve,ariaPlaceholder:null,ariaPosInSet:R,ariaPressed:Pe,ariaReadOnly:Pe,ariaRelevant:null,ariaRequired:Pe,ariaRoleDescription:ve,ariaRowCount:R,ariaRowIndex:R,ariaRowSpan:R,ariaSelected:Pe,ariaSetSize:R,ariaSort:null,ariaValueMax:R,ariaValueMin:R,ariaValueNow:R,ariaValueText:null,role:null},transform(e,t){return t==="role"?t:"aria-"+t.slice(4).toLowerCase()}});function tc(e,t){return t in e?e[t]:t}function ac(e,t){return tc(e,t.toLowerCase())}var Fb=ha({attributes:{acceptcharset:"accept-charset",classname:"class",htmlfor:"for",httpequiv:"http-equiv"},mustUseProperty:["checked","multiple","muted","selected"],properties:{abbr:null,accept:kn,acceptCharset:ve,accessKey:ve,action:null,allow:null,allowFullScreen:ee,allowPaymentRequest:ee,allowUserMedia:ee,alpha:ee,alt:null,as:null,async:ee,autoCapitalize:null,autoComplete:ve,autoFocus:ee,autoPlay:ee,blocking:ve,capture:null,charSet:null,checked:ee,cite:null,className:ve,closedBy:null,colorSpace:null,cols:R,colSpan:R,command:null,commandFor:null,content:null,contentEditable:Pe,controls:ee,controlsList:ve,coords:R|kn,crossOrigin:null,data:null,dateTime:null,decoding:null,default:ee,defer:ee,dir:null,dirName:null,disabled:ee,download:ec,draggable:Pe,encType:null,enterKeyHint:null,fetchPriority:null,form:null,formAction:null,formEncType:null,formMethod:null,formNoValidate:ee,formTarget:null,headers:ve,height:R,hidden:ec,high:R,href:null,hrefLang:null,htmlFor:ve,httpEquiv:ve,id:null,imageSizes:null,imageSrcSet:null,inert:ee,inputMode:null,integrity:null,is:null,isMap:ee,itemId:null,itemProp:ve,itemRef:ve,itemScope:ee,itemType:ve,kind:null,label:null,lang:null,language:null,list:null,loading:null,loop:ee,low:R,manifest:null,max:null,maxLength:R,media:null,method:null,min:null,minLength:R,multiple:ee,muted:ee,name:null,nonce:null,noModule:ee,noValidate:ee,onAbort:null,onAfterPrint:null,onAuxClick:null,onBeforeMatch:null,onBeforePrint:null,onBeforeToggle:null,onBeforeUnload:null,onBlur:null,onCancel:null,onCanPlay:null,onCanPlayThrough:null,onChange:null,onClick:null,onClose:null,onContextLost:null,onContextMenu:null,onContextRestored:null,onCopy:null,onCueChange:null,onCut:null,onDblClick:null,onDrag:null,onDragEnd:null,onDragEnter:null,onDragExit:null,onDragLeave:null,onDragOver:null,onDragStart:null,onDrop:null,onDurationChange:null,onEmptied:null,onEnded:null,onError:null,onFocus:null,onFormData:null,onHashChange:null,onInput:null,onInvalid:null,onKeyDown:null,onKeyPress:null,onKeyUp:null,onLanguageChange:null,onLoad:null,onLoadedData:null,onLoadedMetadata:null,onLoadEnd:null,onLoadStart:null,onMessage:null,onMessageError:null,onMouseDown:null,onMouseEnter:null,onMouseLeave:null,onMouseMove:null,onMouseOut:null,onMouseOver:null,onMouseUp:null,onOffline:null,onOnline:null,onPageHide:null,onPageShow:null,onPaste:null,onPause:null,onPlay:null,onPlaying:null,onPopState:null,onProgress:null,onRateChange:null,onRejectionHandled:null,onReset:null,onResize:null,onScroll:null,onScrollEnd:null,onSecurityPolicyViolation:null,onSeeked:null,onSeeking:null,onSelect:null,onSlotChange:null,onStalled:null,onStorage:null,onSubmit:null,onSuspend:null,onTimeUpdate:null,onToggle:null,onUnhandledRejection:null,onUnload:null,onVolumeChange:null,onWaiting:null,onWheel:null,open:ee,optimum:R,pattern:null,ping:ve,placeholder:null,playsInline:ee,popover:null,popoverTarget:null,popoverTargetAction:null,poster:null,preload:null,readOnly:ee,referrerPolicy:null,rel:ve,required:ee,reversed:ee,rows:R,rowSpan:R,sandbox:ve,scope:null,scoped:ee,seamless:ee,selected:ee,shadowRootClonable:ee,shadowRootCustomElementRegistry:ee,shadowRootDelegatesFocus:ee,shadowRootMode:null,shadowRootSerializable:ee,shape:null,size:R,sizes:null,slot:null,span:R,spellCheck:Pe,src:null,srcDoc:null,srcLang:null,srcSet:null,start:R,step:null,style:null,tabIndex:R,target:null,title:null,translate:null,type:null,typeMustMatch:ee,useMap:null,value:Pe,width:R,wrap:null,writingSuggestions:null,align:null,aLink:null,archive:ve,axis:null,background:null,bgColor:null,border:R,borderColor:null,bottomMargin:R,cellPadding:null,cellSpacing:null,char:null,charOff:null,classId:null,clear:null,code:null,codeBase:null,codeType:null,color:null,compact:ee,declare:ee,event:null,face:null,frame:null,frameBorder:null,hSpace:R,leftMargin:R,link:null,longDesc:null,lowSrc:null,marginHeight:R,marginWidth:R,noResize:ee,noHref:ee,noShade:ee,noWrap:ee,object:null,profile:null,prompt:null,rev:null,rightMargin:R,rules:null,scheme:null,scrolling:Pe,standby:null,summary:null,text:null,topMargin:R,valueType:null,version:null,vAlign:null,vLink:null,vSpace:R,allowTransparency:null,autoCorrect:null,autoSave:null,credentialless:ee,disablePictureInPicture:ee,disableRemotePlayback:ee,exportParts:kn,part:ve,prefix:null,property:null,results:R,security:null,unselectable:null},space:"html",transform:ac});var Pb=ha({attributes:{accentHeight:"accent-height",alignmentBaseline:"alignment-baseline",arabicForm:"arabic-form",baselineShift:"baseline-shift",capHeight:"cap-height",className:"class",clipPath:"clip-path",clipRule:"clip-rule",colorInterpolation:"color-interpolation",colorInterpolationFilters:"color-interpolation-filters",colorProfile:"color-profile",colorRendering:"color-rendering",crossOrigin:"crossorigin",dataType:"datatype",dominantBaseline:"dominant-baseline",enableBackground:"enable-background",fillOpacity:"fill-opacity",fillRule:"fill-rule",floodColor:"flood-color",floodOpacity:"flood-opacity",fontFamily:"font-family",fontSize:"font-size",fontSizeAdjust:"font-size-adjust",fontStretch:"font-stretch",fontStyle:"font-style",fontVariant:"font-variant",fontWeight:"font-weight",glyphName:"glyph-name",glyphOrientationHorizontal:"glyph-orientation-horizontal",glyphOrientationVertical:"glyph-orientation-vertical",hrefLang:"hreflang",horizAdvX:"horiz-adv-x",horizOriginX:"horiz-origin-x",horizOriginY:"horiz-origin-y",imageRendering:"image-rendering",letterSpacing:"letter-spacing",lightingColor:"lighting-color",markerEnd:"marker-end",markerMid:"marker-mid",markerStart:"marker-start",maskType:"mask-type",navDown:"nav-down",navDownLeft:"nav-down-left",navDownRight:"nav-down-right",navLeft:"nav-left",navNext:"nav-next",navPrev:"nav-prev",navRight:"nav-right",navUp:"nav-up",navUpLeft:"nav-up-left",navUpRight:"nav-up-right",onAbort:"onabort",onActivate:"onactivate",onAfterPrint:"onafterprint",onBeforePrint:"onbeforeprint",onBegin:"onbegin",onCancel:"oncancel",onCanPlay:"oncanplay",onCanPlayThrough:"oncanplaythrough",onChange:"onchange",onClick:"onclick",onClose:"onclose",onCopy:"oncopy",onCueChange:"oncuechange",onCut:"oncut",onDblClick:"ondblclick",onDrag:"ondrag",onDragEnd:"ondragend",onDragEnter:"ondragenter",onDragExit:"ondragexit",onDragLeave:"ondragleave",onDragOver:"ondragover",onDragStart:"ondragstart",onDrop:"ondrop",onDurationChange:"ondurationchange",onEmptied:"onemptied",onEnd:"onend",onEnded:"onended",onError:"onerror",onFocus:"onfocus",onFocusIn:"onfocusin",onFocusOut:"onfocusout",onHashChange:"onhashchange",onInput:"oninput",onInvalid:"oninvalid",onKeyDown:"onkeydown",onKeyPress:"onkeypress",onKeyUp:"onkeyup",onLoad:"onload",onLoadedData:"onloadeddata",onLoadedMetadata:"onloadedmetadata",onLoadStart:"onloadstart",onMessage:"onmessage",onMouseDown:"onmousedown",onMouseEnter:"onmouseenter",onMouseLeave:"onmouseleave",onMouseMove:"onmousemove",onMouseOut:"onmouseout",onMouseOver:"onmouseover",onMouseUp:"onmouseup",onMouseWheel:"onmousewheel",onOffline:"onoffline",onOnline:"ononline",onPageHide:"onpagehide",onPageShow:"onpageshow",onPaste:"onpaste",onPause:"onpause",onPlay:"onplay",onPlaying:"onplaying",onPopState:"onpopstate",onProgress:"onprogress",onRateChange:"onratechange",onRepeat:"onrepeat",onReset:"onreset",onResize:"onresize",onScroll:"onscroll",onSeeked:"onseeked",onSeeking:"onseeking",onSelect:"onselect",onShow:"onshow",onStalled:"onstalled",onStorage:"onstorage",onSubmit:"onsubmit",onSuspend:"onsuspend",onTimeUpdate:"ontimeupdate",onToggle:"ontoggle",onUnload:"onunload",onVolumeChange:"onvolumechange",onWaiting:"onwaiting",onZoom:"onzoom",overlinePosition:"overline-position",overlineThickness:"overline-thickness",paintOrder:"paint-order",panose1:"panose-1",pointerEvents:"pointer-events",referrerPolicy:"referrerpolicy",renderingIntent:"rendering-intent",shapeRendering:"shape-rendering",stopColor:"stop-color",stopOpacity:"stop-opacity",strikethroughPosition:"strikethrough-position",strikethroughThickness:"strikethrough-thickness",strokeDashArray:"stroke-dasharray",strokeDashOffset:"stroke-dashoffset",strokeLineCap:"stroke-linecap",strokeLineJoin:"stroke-linejoin",strokeMiterLimit:"stroke-miterlimit",strokeOpacity:"stroke-opacity",strokeWidth:"stroke-width",tabIndex:"tabindex",textAnchor:"text-anchor",textDecoration:"text-decoration",textRendering:"text-rendering",transformOrigin:"transform-origin",typeOf:"typeof",underlinePosition:"underline-position",underlineThickness:"underline-thickness",unicodeBidi:"unicode-bidi",unicodeRange:"unicode-range",unitsPerEm:"units-per-em",vAlphabetic:"v-alphabetic",vHanging:"v-hanging",vIdeographic:"v-ideographic",vMathematical:"v-mathematical",vectorEffect:"vector-effect",vertAdvY:"vert-adv-y",vertOriginX:"vert-origin-x",vertOriginY:"vert-origin-y",wordSpacing:"word-spacing",writingMode:"writing-mode",xHeight:"x-height",playbackOrder:"playbackorder",timelineBegin:"timelinebegin"},properties:{about:Ht,accentHeight:R,accumulate:null,additive:null,alignmentBaseline:null,alphabetic:R,amplitude:R,arabicForm:null,ascent:R,attributeName:null,attributeType:null,azimuth:R,bandwidth:null,baselineShift:null,baseFrequency:null,baseProfile:null,bbox:null,begin:null,bias:R,by:null,calcMode:null,capHeight:R,className:ve,clip:null,clipPath:null,clipPathUnits:null,clipRule:null,color:null,colorInterpolation:null,colorInterpolationFilters:null,colorProfile:null,colorRendering:null,content:null,contentScriptType:null,contentStyleType:null,crossOrigin:null,cursor:null,cx:null,cy:null,d:null,dataType:null,defaultAction:null,descent:R,diffuseConstant:R,direction:null,display:null,dur:null,divisor:R,dominantBaseline:null,download:ee,dx:null,dy:null,edgeMode:null,editable:null,elevation:R,enableBackground:null,end:null,event:null,exponent:R,externalResourcesRequired:null,fill:null,fillOpacity:R,fillRule:null,filter:null,filterRes:null,filterUnits:null,floodColor:null,floodOpacity:null,focusable:null,focusHighlight:null,fontFamily:null,fontSize:null,fontSizeAdjust:null,fontStretch:null,fontStyle:null,fontVariant:null,fontWeight:null,format:null,fr:null,from:null,fx:null,fy:null,g1:kn,g2:kn,glyphName:kn,glyphOrientationHorizontal:null,glyphOrientationVertical:null,glyphRef:null,gradientTransform:null,gradientUnits:null,handler:null,hanging:R,hatchContentUnits:null,hatchUnits:null,height:null,href:null,hrefLang:null,horizAdvX:R,horizOriginX:R,horizOriginY:R,id:null,ideographic:R,imageRendering:null,initialVisibility:null,in:null,in2:null,intercept:R,k:R,k1:R,k2:R,k3:R,k4:R,kernelMatrix:Ht,kernelUnitLength:null,keyPoints:null,keySplines:null,keyTimes:null,kerning:null,lang:null,lengthAdjust:null,letterSpacing:null,lightingColor:null,limitingConeAngle:R,local:null,markerEnd:null,markerMid:null,markerStart:null,markerHeight:null,markerUnits:null,markerWidth:null,mask:null,maskContentUnits:null,maskType:null,maskUnits:null,mathematical:null,max:null,media:null,mediaCharacterEncoding:null,mediaContentEncodings:null,mediaSize:R,mediaTime:null,method:null,min:null,mode:null,name:null,navDown:null,navDownLeft:null,navDownRight:null,navLeft:null,navNext:null,navPrev:null,navRight:null,navUp:null,navUpLeft:null,navUpRight:null,numOctaves:null,observer:null,offset:null,onAbort:null,onActivate:null,onAfterPrint:null,onBeforePrint:null,onBegin:null,onCancel:null,onCanPlay:null,onCanPlayThrough:null,onChange:null,onClick:null,onClose:null,onCopy:null,onCueChange:null,onCut:null,onDblClick:null,onDrag:null,onDragEnd:null,onDragEnter:null,onDragExit:null,onDragLeave:null,onDragOver:null,onDragStart:null,onDrop:null,onDurationChange:null,onEmptied:null,onEnd:null,onEnded:null,onError:null,onFocus:null,onFocusIn:null,onFocusOut:null,onHashChange:null,onInput:null,onInvalid:null,onKeyDown:null,onKeyPress:null,onKeyUp:null,onLoad:null,onLoadedData:null,onLoadedMetadata:null,onLoadStart:null,onMessage:null,onMouseDown:null,onMouseEnter:null,onMouseLeave:null,onMouseMove:null,onMouseOut:null,onMouseOver:null,onMouseUp:null,onMouseWheel:null,onOffline:null,onOnline:null,onPageHide:null,onPageShow:null,onPaste:null,onPause:null,onPlay:null,onPlaying:null,onPopState:null,onProgress:null,onRateChange:null,onRepeat:null,onReset:null,onResize:null,onScroll:null,onSeeked:null,onSeeking:null,onSelect:null,onShow:null,onStalled:null,onStorage:null,onSubmit:null,onSuspend:null,onTimeUpdate:null,onToggle:null,onUnload:null,onVolumeChange:null,onWaiting:null,onZoom:null,opacity:null,operator:null,order:null,orient:null,orientation:null,origin:null,overflow:null,overlay:null,overlinePosition:R,overlineThickness:R,paintOrder:null,panose1:null,path:null,pathLength:R,patternContentUnits:null,patternTransform:null,patternUnits:null,phase:null,ping:ve,pitch:null,playbackOrder:null,pointerEvents:null,points:null,pointsAtX:R,pointsAtY:R,pointsAtZ:R,preserveAlpha:null,preserveAspectRatio:null,primitiveUnits:null,propagate:null,property:Ht,r:null,radius:null,referrerPolicy:null,refX:null,refY:null,rel:Ht,rev:Ht,renderingIntent:null,repeatCount:null,repeatDur:null,requiredExtensions:Ht,requiredFeatures:Ht,requiredFonts:Ht,requiredFormats:Ht,resource:null,restart:null,result:null,rotate:null,rx:null,ry:null,scale:null,seed:null,shapeRendering:null,side:null,slope:null,snapshotTime:null,specularConstant:R,specularExponent:R,spreadMethod:null,spacing:null,startOffset:null,stdDeviation:null,stemh:null,stemv:null,stitchTiles:null,stopColor:null,stopOpacity:null,strikethroughPosition:R,strikethroughThickness:R,string:null,stroke:null,strokeDashArray:Ht,strokeDashOffset:null,strokeLineCap:null,strokeLineJoin:null,strokeMiterLimit:R,strokeOpacity:R,strokeWidth:null,style:null,surfaceScale:R,syncBehavior:null,syncBehaviorDefault:null,syncMaster:null,syncTolerance:null,syncToleranceDefault:null,systemLanguage:Ht,tabIndex:R,tableValues:null,target:null,targetX:R,targetY:R,textAnchor:null,textDecoration:null,textRendering:null,textLength:null,timelineBegin:null,title:null,transformBehavior:null,type:null,typeOf:Ht,to:null,transform:null,transformOrigin:null,u1:null,u2:null,underlinePosition:R,underlineThickness:R,unicode:null,unicodeBidi:null,unicodeRange:null,unitsPerEm:R,values:null,vAlphabetic:R,vMathematical:R,vectorEffect:null,vHanging:R,vIdeographic:R,version:null,vertAdvY:R,vertOriginX:R,vertOriginY:R,viewBox:null,viewTarget:null,visibility:null,width:null,widths:null,wordSpacing:null,writingMode:null,x:null,x1:null,x2:null,xChannelSelector:null,xHeight:R,y:null,y1:null,y2:null,yChannelSelector:null,z:null,zoomAndPan:null},space:"svg",transform:tc});var Xp=ha({properties:{xLinkActuate:null,xLinkArcRole:null,xLinkHref:null,xLinkRole:null,xLinkShow:null,xLinkTitle:null,xLinkType:null},space:"xlink",transform(e,t){return"xlink:"+t.slice(5).toLowerCase()}});var Qp=ha({attributes:{xmlnsxlink:"xmlns:xlink"},properties:{xmlnsXLink:null,xmlns:null},space:"xmlns",transform:ac});var Yp=ha({properties:{xmlBase:null,xmlLang:null,xmlSpace:null},space:"xml",transform(e,t){return"xml:"+t.slice(3).toLowerCase()}});var Kp={classId:"classID",dataType:"datatype",itemId:"itemID",strokeDashArray:"strokeDasharray",strokeDashOffset:"strokeDashoffset",strokeLineCap:"strokeLinecap",strokeLineJoin:"strokeLinejoin",strokeMiterLimit:"strokeMiterlimit",typeOf:"typeof",xLinkActuate:"xlinkActuate",xLinkArcRole:"xlinkArcrole",xLinkHref:"xlinkHref",xLinkRole:"xlinkRole",xLinkShow:"xlinkShow",xLinkTitle:"xlinkTitle",xLinkType:"xlinkType",xmlnsXLink:"xmlnsXlink"};var vI=/[A-Z]/g,Hb=/-[a-z]/g,CI=/^data[-\w.:]+$/i;function Zp(e,t){let a=Ji(t),n=t,l=rt;if(a in e.normal)return e.property[e.normal[a]];if(a.length>4&&a.slice(0,4)==="data"&&CI.test(t)){if(t.charAt(4)==="-"){let r=t.slice(5).replace(Hb,kI);n="data"+r.charAt(0).toUpperCase()+r.slice(1)}else{let r=t.slice(4);if(!Hb.test(r)){let o=r.replace(vI,SI);o.charAt(0)!=="-"&&(o="-"+o),t="data"+o}}l=Kl}return new l(n,t)}function SI(e){return"-"+e.toLowerCase()}function kI(e){return e.charAt(1).toUpperCase()}var _b=Gp([jp,Fb,Xp,Qp,Yp],"html"),nc=Gp([jp,Pb,Xp,Qp,Yp],"svg");function Gb(e){return e.join(" ").trim()}var lL=W(eL(),1);var rc=tL("end"),so=tL("start");function tL(e){return t;function t(a){let n=a&&a.position&&a.position[e]||{};if(typeof n.line=="number"&&n.line>0&&typeof n.column=="number"&&n.column>0)return{line:n.line,column:n.column,offset:typeof n.offset=="number"&&n.offset>-1?n.offset:void 0}}}function $p(e){let t=so(e),a=rc(e);if(t&&a)return{start:t,end:a}}function cl(e){return!e||typeof e!="object"?"":"position"in e||"type"in e?aL(e.position):"start"in e||"end"in e?aL(e):"line"in e||"column"in e?em(e):""}function em(e){return nL(e&&e.line)+":"+nL(e&&e.column)}function aL(e){return em(e&&e.start)+"-"+em(e&&e.end)}function nL(e){return e&&typeof e=="number"?e:1}var Xe=class extends Error{constructor(t,a,n){super(),typeof a=="string"&&(n=a,a=void 0);let l="",r={},o=!1;if(a&&("line"in a&&"column"in a?r={place:a}:"start"in a&&"end"in a?r={place:a}:"type"in a?r={ancestors:[a],place:a.position}:r={...a}),typeof t=="string"?l=t:!r.cause&&t&&(o=!0,l=t.message,r.cause=t),!r.ruleId&&!r.source&&typeof n=="string"){let u=n.indexOf(":");u===-1?r.ruleId=n:(r.source=n.slice(0,u),r.ruleId=n.slice(u+1))}if(!r.place&&r.ancestors&&r.ancestors){let u=r.ancestors[r.ancestors.length-1];u&&(r.place=u.position)}let i=r.place&&"start"in r.place?r.place.start:r.place;this.ancestors=r.ancestors||void 0,this.cause=r.cause||void 0,this.column=i?i.column:void 0,this.fatal=void 0,this.file="",this.message=l,this.line=i?i.line:void 0,this.name=cl(r.place)||"1:1",this.place=r.place||void 0,this.reason=this.message,this.ruleId=r.ruleId||void 0,this.source=r.source||void 0,this.stack=o&&r.cause&&typeof r.cause.stack=="string"?r.cause.stack:"",this.actual=void 0,this.expected=void 0,this.note=void 0,this.url=void 0}};Xe.prototype.file="";Xe.prototype.name="";Xe.prototype.reason="";Xe.prototype.message="";Xe.prototype.stack="";Xe.prototype.column=void 0;Xe.prototype.line=void 0;Xe.prototype.ancestors=void 0;Xe.prototype.cause=void 0;Xe.prototype.fatal=void 0;Xe.prototype.place=void 0;Xe.prototype.ruleId=void 0;Xe.prototype.source=void 0;var tm={}.hasOwnProperty,ZI=new Map,JI=/[A-Z]/g,WI=new Set(["table","tbody","thead","tfoot","tr"]),$I=new Set(["td","th"]),rL="https://github.com/syntax-tree/hast-util-to-jsx-runtime";function am(e,t){if(!t||t.Fragment===void 0)throw new TypeError("Expected `Fragment` in options");let a=t.filePath||void 0,n;if(t.development){if(typeof t.jsxDEV!="function")throw new TypeError("Expected `jsxDEV` in options when `development: true`");n=i2(a,t.jsxDEV)}else{if(typeof t.jsx!="function")throw new TypeError("Expected `jsx` in production options");if(typeof t.jsxs!="function")throw new TypeError("Expected `jsxs` in production options");n=o2(a,t.jsx,t.jsxs)}let l={Fragment:t.Fragment,ancestors:[],components:t.components||{},create:n,elementAttributeNameCase:t.elementAttributeNameCase||"react",evaluater:t.createEvaluater?t.createEvaluater():void 0,filePath:a,ignoreInvalidStyle:t.ignoreInvalidStyle||!1,passKeys:t.passKeys!==!1,passNode:t.passNode||!1,schema:t.space==="svg"?nc:_b,stylePropertyNameCase:t.stylePropertyNameCase||"dom",tableCellAlignToStyle:t.tableCellAlignToStyle!==!1},r=oL(l,e,void 0);return r&&typeof r!="string"?r:l.create(e,l.Fragment,{children:r||void 0},void 0)}function oL(e,t,a){if(t.type==="element")return e2(e,t,a);if(t.type==="mdxFlowExpression"||t.type==="mdxTextExpression")return t2(e,t);if(t.type==="mdxJsxFlowElement"||t.type==="mdxJsxTextElement")return n2(e,t,a);if(t.type==="mdxjsEsm")return a2(e,t);if(t.type==="root")return l2(e,t,a);if(t.type==="text")return r2(e,t)}function e2(e,t,a){let n=e.schema,l=n;t.tagName.toLowerCase()==="svg"&&n.space==="html"&&(l=nc,e.schema=l),e.ancestors.push(t);let r=uL(e,t.tagName,!1),o=u2(e,t),i=lm(e,t);return WI.has(t.tagName)&&(i=i.filter(function(u){return typeof u=="string"?!_p(u):!0})),iL(e,o,r,t),nm(o,i),e.ancestors.pop(),e.schema=n,e.create(t,r,o,a)}function t2(e,t){if(t.data&&t.data.estree&&e.evaluater){let n=t.data.estree.body[0];return n.type,e.evaluater.evaluateExpression(n.expression)}eu(e,t.position)}function a2(e,t){if(t.data&&t.data.estree&&e.evaluater)return e.evaluater.evaluateProgram(t.data.estree);eu(e,t.position)}function n2(e,t,a){let n=e.schema,l=n;t.name==="svg"&&n.space==="html"&&(l=nc,e.schema=l),e.ancestors.push(t);let r=t.name===null?e.Fragment:uL(e,t.name,!0),o=s2(e,t),i=lm(e,t);return iL(e,o,r,t),nm(o,i),e.ancestors.pop(),e.schema=n,e.create(t,r,o,a)}function l2(e,t,a){let n={};return nm(n,lm(e,t)),e.create(t,e.Fragment,n,a)}function r2(e,t){return t.value}function iL(e,t,a,n){typeof a!="string"&&a!==e.Fragment&&e.passNode&&(t.node=n)}function nm(e,t){if(t.length>0){let a=t.length>1?t:t[0];a&&(e.children=a)}}function o2(e,t,a){return n;function n(l,r,o,i){let c=Array.isArray(o.children)?a:t;return i?c(r,o,i):c(r,o)}}function i2(e,t){return a;function a(n,l,r,o){let i=Array.isArray(r.children),u=so(n);return t(l,r,o,i,{columnNumber:u?u.column-1:void 0,fileName:e,lineNumber:u?u.line:void 0},void 0)}}function u2(e,t){let a={},n,l;for(l in t.properties)if(l!=="children"&&tm.call(t.properties,l)){let r=c2(e,l,t.properties[l]);if(r){let[o,i]=r;e.tableCellAlignToStyle&&o==="align"&&typeof i=="string"&&$I.has(t.tagName)?n=i:a[o]=i}}if(n){let r=a.style||(a.style={});r[e.stylePropertyNameCase==="css"?"text-align":"textAlign"]=n}return a}function s2(e,t){let a={};for(let n of t.attributes)if(n.type==="mdxJsxExpressionAttribute")if(n.data&&n.data.estree&&e.evaluater){let r=n.data.estree.body[0];r.type;let o=r.expression;o.type;let i=o.properties[0];i.type,Object.assign(a,e.evaluater.evaluateExpression(i.argument))}else eu(e,t.position);else{let l=n.name,r;if(n.value&&typeof n.value=="object")if(n.value.data&&n.value.data.estree&&e.evaluater){let i=n.value.data.estree.body[0];i.type,r=e.evaluater.evaluateExpression(i.expression)}else eu(e,t.position);else r=n.value===null?!0:n.value;a[l]=r}return a}function lm(e,t){let a=[],n=-1,l=e.passKeys?new Map:ZI;for(;++n<t.children.length;){let r=t.children[n],o;if(e.passKeys){let u=r.type==="element"?r.tagName:r.type==="mdxJsxFlowElement"||r.type==="mdxJsxTextElement"?r.name:void 0;if(u){let c=l.get(u)||0;o=u+"-"+c,l.set(u,c+1)}}let i=oL(e,r,o);i!==void 0&&a.push(i)}return a}function c2(e,t,a){let n=Zp(e.schema,t);if(!(a==null||typeof a=="number"&&Number.isNaN(a))){if(Array.isArray(a)&&(a=n.commaSeparated?Nb(a):Gb(a)),n.property==="style"){let l=typeof a=="object"?a:f2(e,String(a));return e.stylePropertyNameCase==="css"&&(l=d2(l)),["style",l]}return[e.elementAttributeNameCase==="react"&&n.space?Kp[n.property]||n.property:n.attribute,a]}}function f2(e,t){try{return(0,lL.default)(t,{reactCompat:!0})}catch(a){if(e.ignoreInvalidStyle)return{};let n=a,l=new Xe("Cannot parse `style` attribute",{ancestors:e.ancestors,cause:n,ruleId:"style",source:"hast-util-to-jsx-runtime"});throw l.file=e.filePath||void 0,l.url=rL+"#cannot-parse-style-attribute",l}}function uL(e,t,a){let n;if(!a)n={type:"Literal",value:t};else if(t.includes(".")){let l=t.split("."),r=-1,o;for(;++r<l.length;){let i=$s(l[r])?{type:"Identifier",name:l[r]}:{type:"Literal",value:l[r]};o=o?{type:"MemberExpression",object:o,property:i,computed:!!(r&&i.type==="Literal"),optional:!1}:i}n=o}else n=$s(t)&&!/^[a-z]/.test(t)?{type:"Identifier",name:t}:{type:"Literal",value:t};if(n.type==="Literal"){let l=n.value;return tm.call(e.components,l)?e.components[l]:l}if(e.evaluater)return e.evaluater.evaluateExpression(n);eu(e)}function eu(e,t){let a=new Xe("Cannot handle MDX estrees without `createEvaluater`",{ancestors:e.ancestors,place:t,ruleId:"mdx-estree",source:"hast-util-to-jsx-runtime"});throw a.file=e.filePath||void 0,a.url=rL+"#cannot-handle-mdx-estrees-without-createevaluater",a}function d2(e){let t={},a;for(a in e)tm.call(e,a)&&(t[p2(a)]=e[a]);return t}function p2(e){let t=e.replace(JI,m2);return t.slice(0,3)==="ms-"&&(t="-"+t),t}function m2(e){return"-"+e.toLowerCase()}var tu={action:["form"],cite:["blockquote","del","ins","q"],data:["object"],formAction:["button","input"],href:["a","area","base","link"],icon:["menuitem"],itemId:null,manifest:["html"],ping:["a","area"],poster:["video"],src:["audio","embed","iframe","img","input","script","source","track","video"]};var ho=W(Le(),1),Ov=W(_e(),1);var h2={};function Jl(e,t){let a=t||h2,n=typeof a.includeImageAlt=="boolean"?a.includeImageAlt:!0,l=typeof a.includeHtml=="boolean"?a.includeHtml:!0;return cL(e,n,l)}function cL(e,t,a){if(g2(e)){if("value"in e)return e.type==="html"&&!a?"":e.value;if(t&&"alt"in e&&e.alt)return e.alt;if("children"in e)return sL(e.children,t,a)}return Array.isArray(e)?sL(e,t,a):""}function sL(e,t,a){let n=[],l=-1;for(;++l<e.length;)n[l]=cL(e[l],t,a);return n.join("")}function g2(e){return!!(e&&typeof e=="object")}var fL=document.createElement("i");function co(e){let t="&"+e+";";fL.innerHTML=t;let a=fL.textContent;return a.charCodeAt(a.length-1)===59&&e!=="semi"||a===t?!1:a}function ot(e,t,a,n){let l=e.length,r=0,o;if(t<0?t=-t>l?0:l+t:t=t>l?l:t,a=a>0?a:0,n.length<1e4)o=Array.from(n),o.unshift(t,a),e.splice(...o);else for(a&&e.splice(t,a);r<n.length;)o=n.slice(r,r+1e4),o.unshift(t,0),e.splice(...o),r+=1e4,t+=1e4}function Mt(e,t){return e.length>0?(ot(e,e.length,0,t),e):t}var dL={}.hasOwnProperty;function oc(e){let t={},a=-1;for(;++a<e.length;)x2(t,e[a]);return t}function x2(e,t){let a;for(a in t){let l=(dL.call(e,a)?e[a]:void 0)||(e[a]={}),r=t[a],o;if(r)for(o in r){dL.call(l,o)||(l[o]=[]);let i=r[o];y2(l[o],Array.isArray(i)?i:i?[i]:[])}}}function y2(e,t){let a=-1,n=[];for(;++a<t.length;)(t[a].add==="after"?e:n).push(t[a]);ot(e,0,0,n)}function ic(e,t){let a=Number.parseInt(e,t);return a<9||a===11||a>13&&a<32||a>126&&a<160||a>55295&&a<57344||a>64975&&a<65008||(a&65535)===65535||(a&65535)===65534||a>1114111?"\uFFFD":String.fromCodePoint(a)}function Lt(e){return e.replace(/[\t\n\r ]+/g," ").replace(/^ | $/g,"").toLowerCase().toUpperCase()}var tt=fl(/[A-Za-z]/),He=fl(/[\dA-Za-z]/),pL=fl(/[#-'*+\--9=?A-Z^-~]/);function Wl(e){return e!==null&&(e<32||e===127)}var au=fl(/\d/),mL=fl(/[\dA-Fa-f]/),hL=fl(/[!-/:-@[-`{-~]/);function H(e){return e!==null&&e<-2}function se(e){return e!==null&&(e<0||e===32)}function K(e){return e===-2||e===-1||e===32}var $l=fl(/\p{P}|\p{S}/u),Ha=fl(/\s/);function fl(e){return t;function t(a){return a!==null&&a>-1&&e.test(String.fromCharCode(a))}}function ga(e){let t=[],a=-1,n=0,l=0;for(;++a<e.length;){let r=e.charCodeAt(a),o="";if(r===37&&He(e.charCodeAt(a+1))&&He(e.charCodeAt(a+2)))l=2;else if(r<128)/[!#$&-;=?-Z_a-z~]/.test(String.fromCharCode(r))||(o=String.fromCharCode(r));else if(r>55295&&r<57344){let i=e.charCodeAt(a+1);r<56320&&i>56319&&i<57344?(o=String.fromCharCode(r,i),l=1):o="\uFFFD"}else o=String.fromCharCode(r);o&&(t.push(e.slice(n,a),encodeURIComponent(o)),n=a+l+1,o=""),l&&(a+=l,l=0)}return t.join("")+e.slice(n)}function J(e,t,a,n){let l=n?n-1:1/0,r=0;return o;function o(u){return K(u)?(e.enter(a),i(u)):t(u)}function i(u){return K(u)&&r++<l?(e.consume(u),i):(e.exit(a),t(u))}}function rm(e,t,a,n,l,r){let o=0;return i;function i(s){return r>0&&K(s)?(e.enter(n),u(s)):c(s)}function u(s){return K(s)&&o<r?(e.consume(s),o++,u):(e.exit(n),c(s))}function c(s){return o>=l?t(s):a(s)}}var gL={tokenize:b2};function b2(e){let t=e.attempt(this.parser.constructs.contentInitial,n,l),a;return t;function n(i){if(i===null){e.consume(i);return}return e.enter("lineEnding"),e.consume(i),e.exit("lineEnding"),J(e,t,"linePrefix")}function l(i){return e.enter("paragraph"),r(i)}function r(i){let u=e.enter("chunkText",{contentType:"text",previous:a});return a&&(a.next=u),a=u,o(i)}function o(i){if(i===null){e.exit("chunkText"),e.exit("paragraph"),e.consume(i);return}return H(i)?(e.consume(i),e.exit("chunkText"),r):(e.consume(i),o)}}var wn=class{constructor(){this.index=new Map,this.map=[]}add(t,a,n){xL(this,t,a,n,!1)}addBefore(t,a,n){xL(this,t,a,n,!0)}consume(t){if(this.map.sort(function(r,o){return r[0]-o[0]}),this.map.length===0)return;let a=this.map.length,n=[];for(;a>0;)a-=1,n.push(t.slice(this.map[a][0]+this.map[a][1]),this.map[a][2]),t.length=this.map[a][0];n.push(t.slice()),t.length=0;let l=n.pop();for(;l;){for(let r of l)t.push(r);l=n.pop()}this.map.length=0,this.index.clear()}};function xL(e,t,a,n,l){if(a===0&&n.length===0)return;let r=e.index.get(t);if(r){r[1]+=a,l?(n.push(...r[2]),r[2]=n):r[2].push(...n);return}let o=[t,a,n];e.map.push(o),e.index.set(t,o)}var bL={tokenize:L2},yL={tokenize:v2};function L2(e){let t=this,a=[],n=0,l,r,o;return i;function i(x){if(n<a.length){let S=a[n];return t.containerState=S[1],e.attempt(S[0].continuation,u,c)(x)}return c(x)}function u(x){if(n++,t.containerState._closeFlow){t.containerState._closeFlow=void 0,l&&m();let S=t.events.length,I=S,v;for(;I--;)if(t.events[I][0]==="exit"&&t.events[I][1].type==="chunkFlow"){v=t.events[I][1].end;break}g(n);let T=S;for(;T<t.events.length;)t.events[T][1].end={...v},T++;let N=new wn;return N.add(I+1,0,t.events.slice(S)),N.add(S,T-S,[]),N.consume(t.events),c(x)}return i(x)}function c(x){if(n===a.length){if(!l)return p(x);if(l.currentConstruct&&l.currentConstruct.concrete)return h(x);t.interrupt=!!(l.currentConstruct&&!l._gfmTableDynamicInterruptHack)}return t.containerState={},e.check(yL,s,f)(x)}function s(x){return l&&m(),g(n),p(x)}function f(x){return t.parser.lazy[t.now().line]=n!==a.length,o=t.now().offset,h(x)}function p(x){return t.containerState={},e.attempt(yL,d,h)(x)}function d(x){return n++,a.push([t.currentConstruct,t.containerState]),p(x)}function h(x){if(x===null){l&&m(),g(0),e.consume(x);return}return l=l||t.parser.flow(t.now()),e.enter("chunkFlow",{_tokenizer:l,contentType:"flow",previous:r}),y(x)}function y(x){if(x===null){k(e.exit("chunkFlow"),!0),g(0),e.consume(x);return}return H(x)?(e.consume(x),k(e.exit("chunkFlow")),n=0,t.interrupt=void 0,i):(e.consume(x),y)}function k(x,S){let I=t.sliceStream(x);if(S&&I.push(null),x.previous=r,r&&(r.next=x),r=x,l.defineSkip(x.start),l.write(I),t.parser.lazy[x.start.line]){let v=l.events.length;for(;v--;)if(l.events[v][1].start.offset<o&&(!l.events[v][1].end||l.events[v][1].end.offset>o))return;let T=t.events.length,N=T,U,w;for(;N--;)if(t.events[N][0]==="exit"&&t.events[N][1].type==="chunkFlow"){if(U){w=t.events[N][1].end;break}U=!0}for(g(n),v=T;v<t.events.length;)t.events[v][1].end={...w},v++;let ne=new wn;ne.add(N+1,0,t.events.slice(T)),ne.add(T,v-T,[]),ne.consume(t.events)}}function g(x){let S=a.length;for(;S-- >x;){let I=a[S];t.containerState=I[1],I[0].exit.call(t,e)}a.length=x}function m(){l.write([null]),r=void 0,l=void 0,t.containerState._closeFlow=void 0}}function v2(e,t,a){return J(e,e.attempt(this.parser.constructs.document,t,a),"linePrefix",this.parser.constructs.disable.null.includes("codeIndented")?void 0:4)}function fo(e){if(e===null||se(e)||Ha(e))return 1;if($l(e))return 2}function dl(e,t,a){let n=[],l=-1;for(;++l<e.length;){let r=e[l].resolveAll;r&&!n.includes(r)&&(t=r(t,a),n.push(r))}return t}var nu={name:"attention",resolveAll:C2,tokenize:S2};function C2(e,t){let a=-1,n;for(;++a<e.length;)if(e[a][0]==="enter"&&e[a][1].type==="attentionSequence"&&e[a][1]._close){let l=a;for(;l--;)if(e[l][0]==="exit"&&e[l][1].type==="attentionSequence"&&e[l][1]._open&&t.sliceSerialize(e[l][1]).charCodeAt(0)===t.sliceSerialize(e[a][1]).charCodeAt(0)){if((e[l][1]._close||e[a][1]._open)&&(e[a][1].end.offset-e[a][1].start.offset)%3&&!((e[l][1].end.offset-e[l][1].start.offset+e[a][1].end.offset-e[a][1].start.offset)%3))continue;let r=e[l][1].end.offset-e[l][1].start.offset>1&&e[a][1].end.offset-e[a][1].start.offset>1?2:1,o={...e[l][1].end},i={...e[a][1].start};LL(o,-r),LL(i,r);let u={type:r>1?"strongSequence":"emphasisSequence",start:o,end:{...e[l][1].end}},c={type:r>1?"strongSequence":"emphasisSequence",start:{...e[a][1].start},end:i},s={type:r>1?"strongText":"emphasisText",start:{...e[l][1].end},end:{...e[a][1].start}},f={type:r>1?"strong":"emphasis",start:{...u.start},end:{...c.end}};e[l][1].end={...u.start},e[a][1].start={...c.end},n=[],e[l][1].end.offset-e[l][1].start.offset&&(n=Mt(n,[["enter",e[l][1],t],["exit",e[l][1],t]])),n=Mt(n,[["enter",f,t],["enter",u,t],["exit",u,t],["enter",s,t]]),n=Mt(n,dl(t.parser.constructs.insideSpan.null,e.slice(l+1,a),t)),n=Mt(n,[["exit",s,t],["enter",c,t],["exit",c,t],["exit",f,t]]);let p=0;e[a][1].end.offset-e[a][1].start.offset&&(p=2,n=Mt(n,[["enter",e[a][1],t],["exit",e[a][1],t]])),ot(e,l-1,a-l+3,n),a=l+n.length-p-2;break}}for(a=-1;++a<e.length;)e[a][1].type==="attentionSequence"&&(e[a][1].type="data");return e}function S2(e,t){let a=this.parser.constructs.attentionMarkers.null,n=this.previous,l=fo(n),r;return o;function o(u){return r=u,e.enter("attentionSequence"),i(u)}function i(u){if(u===r)return e.consume(u),i;let c=e.exit("attentionSequence"),s=fo(u),f=!s||s===2&&l||a.includes(u)&&u!==42&&u!==95,p=!l||l===2&&s||a.includes(n)&&n!==42&&n!==95;return c._open=!!(r===42?f:f&&(l||!p)),c._close=!!(r===42?p:p&&(s||!f)),t(u)}}function LL(e,t){e.column+=t,e.offset+=t,e._bufferIndex+=t}var om={name:"autolink",tokenize:k2};function k2(e,t,a){let n=0;return l;function l(d){return e.enter("autolink"),e.enter("autolinkMarker"),e.consume(d),e.exit("autolinkMarker"),e.enter("autolinkProtocol"),r}function r(d){return tt(d)?(e.consume(d),o):d===64?a(d):c(d)}function o(d){return d===43||d===45||d===46||He(d)?(n=1,i(d)):c(d)}function i(d){return d===58?(e.consume(d),n=0,u):(d===43||d===45||d===46||He(d))&&n++<32?(e.consume(d),i):(n=0,c(d))}function u(d){return d===62?(e.exit("autolinkProtocol"),e.enter("autolinkMarker"),e.consume(d),e.exit("autolinkMarker"),e.exit("autolink"),t):d===null||d===32||d===60||Wl(d)?a(d):(e.consume(d),u)}function c(d){return d===64?(e.consume(d),s):pL(d)?(e.consume(d),c):a(d)}function s(d){return He(d)?f(d):a(d)}function f(d){return d===46?(e.consume(d),n=0,s):d===62?(e.exit("autolinkProtocol").type="autolinkEmail",e.enter("autolinkMarker"),e.consume(d),e.exit("autolinkMarker"),e.exit("autolink"),t):p(d)}function p(d){if((d===45||He(d))&&n++<63){let h=d===45?p:f;return e.consume(d),h}return a(d)}}var _a={partial:!0,tokenize:w2};function w2(e,t,a){return n;function n(r){return K(r)?J(e,l,"linePrefix")(r):l(r)}function l(r){return r===null||H(r)?t(r):a(r)}}var uc={continuation:{tokenize:A2},exit:T2,name:"blockQuote",tokenize:I2};function I2(e,t,a){let n=this;return l;function l(o){if(o===62){let i=n.containerState;return i.open||(e.enter("blockQuote",{_container:!0}),i.open=!0),e.enter("blockQuotePrefix"),e.enter("blockQuoteMarker"),e.consume(o),e.exit("blockQuoteMarker"),r}return a(o)}function r(o){return K(o)?(e.enter("blockQuotePrefixWhitespace"),e.consume(o),e.exit("blockQuotePrefixWhitespace"),e.exit("blockQuotePrefix"),t):(e.exit("blockQuotePrefix"),t(o))}}function A2(e,t,a){let n=this;return l;function l(o){return K(o)?J(e,r,"linePrefix",n.parser.constructs.disable.null.includes("codeIndented")?void 0:4)(o):r(o)}function r(o){return e.attempt(uc,t,a)(o)}}function T2(e){e.exit("blockQuote")}var sc={name:"characterEscape",tokenize:D2};function D2(e,t,a){return n;function n(r){return e.enter("characterEscape"),e.enter("escapeMarker"),e.consume(r),e.exit("escapeMarker"),l}function l(r){return hL(r)?(e.enter("characterEscapeValue"),e.consume(r),e.exit("characterEscapeValue"),e.exit("characterEscape"),t):a(r)}}var cc={name:"characterReference",tokenize:M2};function M2(e,t,a){let n=this,l=0,r,o;return i;function i(f){return e.enter("characterReference"),e.enter("characterReferenceMarker"),e.consume(f),e.exit("characterReferenceMarker"),u}function u(f){return f===35?(e.enter("characterReferenceMarkerNumeric"),e.consume(f),e.exit("characterReferenceMarkerNumeric"),c):(e.enter("characterReferenceValue"),r=31,o=He,s(f))}function c(f){return f===88||f===120?(e.enter("characterReferenceMarkerHexadecimal"),e.consume(f),e.exit("characterReferenceMarkerHexadecimal"),e.enter("characterReferenceValue"),r=6,o=mL,s):(e.enter("characterReferenceValue"),r=7,o=au,s(f))}function s(f){if(f===59&&l){let p=e.exit("characterReferenceValue");return o===He&&!co(n.sliceSerialize(p))?a(f):(e.enter("characterReferenceMarker"),e.consume(f),e.exit("characterReferenceMarker"),e.exit("characterReference"),t)}return o(f)&&l++<r?(e.consume(f),s):a(f)}}var lu={partial:!0,tokenize:E2};function E2(e,t,a){let n=this;return l;function l(o){return o===null?a(o):(e.enter("lineEnding"),e.consume(o),e.exit("lineEnding"),r)}function r(o){return n.parser.lazy[n.now().line]?a(o):t(o)}}var fc={concrete:!0,name:"codeFenced",tokenize:z2};function z2(e,t,a){let n=this,l={partial:!0,tokenize:I},r=0,o=0,i;return u;function u(v){return c(v)}function c(v){let T=n.events[n.events.length-1];return r=T&&T[1].type==="linePrefix"?T[2].sliceSerialize(T[1],!0).length:0,i=v,e.enter("codeFenced"),e.enter("codeFencedFence"),e.enter("codeFencedFenceSequence"),s(v)}function s(v){return v===i?(o++,e.consume(v),s):o<3?a(v):(e.exit("codeFencedFenceSequence"),K(v)?J(e,f,"whitespace")(v):f(v))}function f(v){return v===null||H(v)?(e.exit("codeFencedFence"),n.interrupt?t(v):e.check(lu,y,S)(v)):(e.enter("codeFencedFenceInfo"),e.enter("chunkString",{contentType:"string"}),p(v))}function p(v){return v===null||H(v)?(e.exit("chunkString"),e.exit("codeFencedFenceInfo"),f(v)):K(v)?(e.exit("chunkString"),e.exit("codeFencedFenceInfo"),J(e,d,"whitespace")(v)):v===96&&v===i?a(v):(e.consume(v),p)}function d(v){return v===null||H(v)?f(v):(e.enter("codeFencedFenceMeta"),e.enter("chunkString",{contentType:"string"}),h(v))}function h(v){return v===null||H(v)?(e.exit("chunkString"),e.exit("codeFencedFenceMeta"),f(v)):v===96&&v===i?a(v):(e.consume(v),h)}function y(v){return e.attempt(l,S,k)(v)}function k(v){return e.enter("lineEnding"),e.consume(v),e.exit("lineEnding"),g}function g(v){return r>0&&K(v)?J(e,m,"linePrefix",r+1)(v):m(v)}function m(v){return v===null||H(v)?e.check(lu,y,S)(v):(e.enter("codeFlowValue"),x(v))}function x(v){return v===null||H(v)?(e.exit("codeFlowValue"),m(v)):(e.consume(v),x)}function S(v){return e.exit("codeFenced"),t(v)}function I(v,T,N){let U=0;return w;function w(O){return v.enter("lineEnding"),v.consume(O),v.exit("lineEnding"),ne}function ne(O){return v.enter("codeFencedFence"),K(O)?J(v,te,"linePrefix",n.parser.constructs.disable.null.includes("codeIndented")?void 0:4)(O):te(O)}function te(O){return O===i?(v.enter("codeFencedFenceSequence"),z(O)):N(O)}function z(O){return O===i?(U++,v.consume(O),z):U>=o?(v.exit("codeFencedFenceSequence"),K(O)?J(v,E,"whitespace")(O):E(O)):N(O)}function E(O){return O===null||H(O)?(v.exit("codeFencedFence"),T(O)):N(O)}}}var ru={name:"codeIndented",tokenize:R2},B2={partial:!0,tokenize:O2};function R2(e,t,a){return n;function n(i){return e.enter("codeIndented"),rm(e,l,a,"linePrefix",4,4)(i)}function l(i){return i===null?o(i):H(i)?e.attempt(B2,l,o)(i):(e.enter("codeFlowValue"),r(i))}function r(i){return i===null||H(i)?(e.exit("codeFlowValue"),l(i)):(e.consume(i),r)}function o(i){return e.exit("codeIndented"),t(i)}}function O2(e,t,a){let n=this;return l;function l(o){return n.parser.lazy[n.now().line]?a(o):H(o)?(e.enter("lineEnding"),e.consume(o),e.exit("lineEnding"),l):rm(e,t,r,"linePrefix",4,4)(o)}function r(o){return H(o)?l(o):a(o)}}var im={name:"codeText",previous:q2,resolve:N2,tokenize:U2};function N2(e){let t=e.length-4,a=3,n,l;if((e[a][1].type==="lineEnding"||e[a][1].type==="space")&&(e[t][1].type==="lineEnding"||e[t][1].type==="space")){for(n=a;++n<t;)if(e[n][1].type==="codeTextData"){e[a][1].type="codeTextPadding",e[t][1].type="codeTextPadding",a+=2,t-=2;break}}for(n=a-1,t++;++n<=t;)l===void 0?n!==t&&e[n][1].type!=="lineEnding"&&(l=n):(n===t||e[n][1].type==="lineEnding")&&(e[l][1].type="codeTextData",n!==l+2&&(e[l][1].end=e[n-1][1].end,e.splice(l+2,n-l-2),t-=n-l-2,n=l+2),l=void 0);return e}function q2(e){return e!==96||this.events[this.events.length-1][1].type==="characterEscape"}function U2(e,t,a){let n=this,l=0,r,o;return i;function i(p){return e.enter("codeText"),e.enter("codeTextSequence"),u(p)}function u(p){return p===96?(e.consume(p),l++,u):(e.exit("codeTextSequence"),c(p))}function c(p){return p===null?a(p):p===32?(e.enter("space"),e.consume(p),e.exit("space"),c):p===96?(o=e.enter("codeTextSequence"),r=0,f(p)):H(p)?(e.enter("lineEnding"),e.consume(p),e.exit("lineEnding"),c):(e.enter("codeTextData"),s(p))}function s(p){return p===null||p===32||p===96||H(p)?(e.exit("codeTextData"),c(p)):(e.consume(p),s)}function f(p){return p===96?(e.consume(p),r++,f):r===l?(e.exit("codeTextSequence"),e.exit("codeText"),t(p)):(o.type="codeTextData",s(p))}}var dc=class{constructor(t){this.left=t?[...t]:[],this.right=[]}get(t){if(t<0||t>=this.left.length+this.right.length)throw new RangeError("Cannot access index `"+t+"` in a splice buffer of size `"+(this.left.length+this.right.length)+"`");return t<this.left.length?this.left[t]:this.right[this.right.length-t+this.left.length-1]}get length(){return this.left.length+this.right.length}shift(){return this.setCursor(0),this.right.pop()}slice(t,a){let n=a??Number.POSITIVE_INFINITY;return n<this.left.length?this.left.slice(t,n):t>this.left.length?this.right.slice(this.right.length-n+this.left.length,this.right.length-t+this.left.length).reverse():this.left.slice(t).concat(this.right.slice(this.right.length-n+this.left.length).reverse())}splice(t,a,n){let l=a||0;this.setCursor(Math.trunc(t));let r=this.right.splice(this.right.length-l,Number.POSITIVE_INFINITY);return n&&ou(this.left,n),r.reverse()}pop(){return this.setCursor(Number.POSITIVE_INFINITY),this.left.pop()}push(t){this.setCursor(Number.POSITIVE_INFINITY),this.left.push(t)}pushMany(t){this.setCursor(Number.POSITIVE_INFINITY),ou(this.left,t)}unshift(t){this.setCursor(0),this.right.push(t)}unshiftMany(t){this.setCursor(0),ou(this.right,t.reverse())}setCursor(t){if(!(t===this.left.length||t>this.left.length&&this.right.length===0||t<0&&this.left.length===0))if(t<this.left.length){let a=this.left.splice(t,Number.POSITIVE_INFINITY);ou(this.right,a.reverse())}else{let a=this.right.splice(this.left.length+this.right.length-t,Number.POSITIVE_INFINITY);ou(this.left,a.reverse())}}};function ou(e,t){let a=0;if(t.length<1e4)e.push(...t);else for(;a<t.length;)e.push(...t.slice(a,a+1e4)),a+=1e4}function pc(e){let t={},a=-1,n,l,r,o,i,u,c,s=new dc(e);for(;++a<s.length;){for(;a in t;)a=t[a];if(n=s.get(a),a&&n[1].type==="chunkFlow"&&s.get(a-1)[1].type==="listItemPrefix"&&(u=n[1]._tokenizer.events,r=0,r<u.length&&u[r][1].type==="lineEndingBlank"&&(r+=2),r<u.length&&u[r][1].type==="content"))for(;++r<u.length&&u[r][1].type!=="content";)u[r][1].type==="chunkText"&&(u[r][1]._isInFirstContentOfListItem=!0,r++);if(n[0]==="enter")n[1].contentType&&(Object.assign(t,F2(s,a)),a=t[a],c=!0);else if(n[1]._container){for(r=a,l=void 0;r--;)if(o=s.get(r),o[1].type==="lineEnding"||o[1].type==="lineEndingBlank")o[0]==="enter"&&(l&&(s.get(l)[1].type="lineEndingBlank"),o[1].type="lineEnding",l=r);else if(!(o[1].type==="linePrefix"||o[1].type==="listItemIndent"))break;l&&(n[1].end={...s.get(l)[1].start},i=s.slice(l,a),i.unshift(n),s.splice(l,a-l+1,i))}}return ot(e,0,Number.POSITIVE_INFINITY,s.slice(0)),!c}function F2(e,t){let a=e.get(t)[1],n=e.get(t)[2],l=t-1,r=[],o=a._tokenizer;o||(o=n.parser[a.contentType](a.start),a._contentTypeTextTrailing&&(o._contentTypeTextTrailing=!0));let i=o.events,u=[],c={},s,f,p=-1,d=a,h=0,y=0,k=[y];for(;d;){for(;e.get(++l)[1]!==d;);r.push(l),d._tokenizer||(s=n.sliceStream(d),d.next||s.push(null),f&&o.defineSkip(d.start),d._isInFirstContentOfListItem&&(o._gfmTasklistFirstContentOfListItem=!0),o.write(s),d._isInFirstContentOfListItem&&(o._gfmTasklistFirstContentOfListItem=void 0)),f=d,d=d.next}for(d=a;++p<i.length;)i[p][0]==="exit"&&i[p-1][0]==="enter"&&i[p][1].type===i[p-1][1].type&&i[p][1].start.line!==i[p][1].end.line&&(y=p+1,k.push(y),d._tokenizer=void 0,d.previous=void 0,d=d.next);for(o.events=[],d?(d._tokenizer=void 0,d.previous=void 0):k.pop(),p=k.length;p--;){let g=i.slice(k[p],k[p+1]),m=r.pop();u.push([m,m+g.length-1]),e.splice(m,2,g)}for(u.reverse(),p=-1;++p<u.length;)c[h+u[p][0]]=h+u[p][1],h+=u[p][1]-u[p][0]-1;return c}var um={resolve:H2,tokenize:_2},P2={partial:!0,tokenize:G2};function H2(e){return pc(e),e}function _2(e,t){let a;return n;function n(i){return e.enter("content"),a=e.enter("chunkContent",{contentType:"content"}),l(i)}function l(i){return i===null?r(i):H(i)?e.check(P2,o,r)(i):(e.consume(i),l)}function r(i){return e.exit("chunkContent"),e.exit("content"),t(i)}function o(i){return e.consume(i),e.exit("chunkContent"),a.next=e.enter("chunkContent",{contentType:"content",previous:a}),a=a.next,l}}function G2(e,t,a){let n=this;return l;function l(o){return e.exit("chunkContent"),e.enter("lineEnding"),e.consume(o),e.exit("lineEnding"),J(e,r,"linePrefix")}function r(o){if(o===null||H(o))return a(o);let i=n.events[n.events.length-1];return!n.parser.constructs.disable.null.includes("codeIndented")&&i&&i[1].type==="linePrefix"&&i[2].sliceSerialize(i[1],!0).length>=4?t(o):e.interrupt(n.parser.constructs.flow,a,t)(o)}}function mc(e,t,a,n,l,r,o,i,u){let c=u||Number.POSITIVE_INFINITY,s=0;return f;function f(g){return g===60?(e.enter(n),e.enter(l),e.enter(r),e.consume(g),e.exit(r),p):g===null||g===32||g===41||Wl(g)?a(g):(e.enter(n),e.enter(o),e.enter(i),e.enter("chunkString",{contentType:"string"}),y(g))}function p(g){return g===62?(e.enter(r),e.consume(g),e.exit(r),e.exit(l),e.exit(n),t):(e.enter(i),e.enter("chunkString",{contentType:"string"}),d(g))}function d(g){return g===62?(e.exit("chunkString"),e.exit(i),p(g)):g===null||g===60||H(g)?a(g):(e.consume(g),g===92?h:d)}function h(g){return g===60||g===62||g===92?(e.consume(g),d):d(g)}function y(g){return!s&&(g===null||g===41||se(g))?(e.exit("chunkString"),e.exit(i),e.exit(o),e.exit(n),t(g)):s<c&&g===40?(e.consume(g),s++,y):g===41?(e.consume(g),s--,y):g===null||g===32||g===40||Wl(g)?a(g):(e.consume(g),g===92?k:y)}function k(g){return g===40||g===41||g===92?(e.consume(g),y):y(g)}}function hc(e,t,a,n,l,r){let o=this,i=0,u;return c;function c(d){return e.enter(n),e.enter(l),e.consume(d),e.exit(l),e.enter(r),s}function s(d){return i>999||d===null||d===91||d===93&&!u||d===94&&!i&&"_hiddenFootnoteSupport"in o.parser.constructs?a(d):d===93?(e.exit(r),e.enter(l),e.consume(d),e.exit(l),e.exit(n),t):H(d)?(e.enter("lineEnding"),e.consume(d),e.exit("lineEnding"),s):(e.enter("chunkString",{contentType:"string"}),f(d))}function f(d){return d===null||d===91||d===93||H(d)||i++>999?(e.exit("chunkString"),s(d)):(e.consume(d),u||(u=!K(d)),d===92?p:f)}function p(d){return d===91||d===92||d===93?(e.consume(d),i++,f):f(d)}}function gc(e,t,a,n,l,r){let o;return i;function i(p){return p===34||p===39||p===40?(e.enter(n),e.enter(l),e.consume(p),e.exit(l),o=p===40?41:p,u):a(p)}function u(p){return p===o?(e.enter(l),e.consume(p),e.exit(l),e.exit(n),t):(e.enter(r),c(p))}function c(p){return p===o?(e.exit(r),u(o)):p===null?a(p):H(p)?(e.enter("lineEnding"),e.consume(p),e.exit("lineEnding"),J(e,c,"linePrefix")):(e.enter("chunkString",{contentType:"string"}),s(p))}function s(p){return p===o||p===null||H(p)?(e.exit("chunkString"),c(p)):(e.consume(p),p===92?f:s)}function f(p){return p===o||p===92?(e.consume(p),s):s(p)}}function er(e,t){let a;return n;function n(l){return H(l)?(e.enter("lineEnding"),e.consume(l),e.exit("lineEnding"),a=!0,n):K(l)?J(e,n,a?"linePrefix":"lineSuffix")(l):t(l)}}var sm={name:"definition",tokenize:j2},V2={partial:!0,tokenize:X2};function j2(e,t,a){let n=this,l;return r;function r(d){return e.enter("definition"),o(d)}function o(d){return hc.call(n,e,i,a,"definitionLabel","definitionLabelMarker","definitionLabelString")(d)}function i(d){return l=Lt(n.sliceSerialize(n.events[n.events.length-1][1]).slice(1,-1)),d===58?(e.enter("definitionMarker"),e.consume(d),e.exit("definitionMarker"),u):a(d)}function u(d){return se(d)?er(e,c)(d):c(d)}function c(d){return mc(e,s,a,"definitionDestination","definitionDestinationLiteral","definitionDestinationLiteralMarker","definitionDestinationRaw","definitionDestinationString")(d)}function s(d){return e.attempt(V2,f,f)(d)}function f(d){return K(d)?J(e,p,"whitespace")(d):p(d)}function p(d){return d===null||H(d)?(e.exit("definition"),n.parser.defined.push(l),t(d)):a(d)}}function X2(e,t,a){return n;function n(i){return se(i)?er(e,l)(i):a(i)}function l(i){return gc(e,r,a,"definitionTitle","definitionTitleMarker","definitionTitleString")(i)}function r(i){return K(i)?J(e,o,"whitespace")(i):o(i)}function o(i){return i===null||H(i)?t(i):a(i)}}var cm={name:"hardBreakEscape",tokenize:Q2};function Q2(e,t,a){return n;function n(r){return e.enter("hardBreakEscape"),e.consume(r),l}function l(r){return H(r)?(e.exit("hardBreakEscape"),t(r)):a(r)}}var fm={name:"headingAtx",resolve:Y2,tokenize:K2};function Y2(e,t){let a=e.length-2,n=3;if(e[n][1].type==="whitespace"&&(n+=2),a-2>n&&e[a][1].type==="whitespace"&&(a-=2),e[a][1].type==="atxHeadingSequence"&&(n===a-1||a-4>n&&e[a-2][1].type==="whitespace")&&(a-=n+1===a?2:4),a>n){let l={type:"atxHeadingText",start:e[n][1].start,end:e[a][1].end},r={type:"chunkText",start:e[n][1].start,end:e[a][1].end,contentType:"text"};ot(e,n,a-n+1,[["enter",l,t],["enter",r,t],["exit",r,t],["exit",l,t]])}return e}function K2(e,t,a){let n=0;return l;function l(s){return e.enter("atxHeading"),r(s)}function r(s){return e.enter("atxHeadingSequence"),o(s)}function o(s){return s===35&&n++<6?(e.consume(s),o):s===null||se(s)?(e.exit("atxHeadingSequence"),i(s)):a(s)}function i(s){return s===35?(e.enter("atxHeadingSequence"),u(s)):s===null||H(s)?(e.exit("atxHeading"),t(s)):K(s)?J(e,i,"whitespace")(s):(e.enter("atxHeadingText"),c(s))}function u(s){return s===35?(e.consume(s),u):(e.exit("atxHeadingSequence"),i(s))}function c(s){return s===null||s===35||se(s)?(e.exit("atxHeadingText"),i(s)):(e.consume(s),c)}}var vL=["address","article","aside","base","basefont","blockquote","body","caption","center","col","colgroup","dd","details","dialog","dir","div","dl","dt","fieldset","figcaption","figure","footer","form","frame","frameset","h1","h2","h3","h4","h5","h6","head","header","hr","html","iframe","legend","li","link","main","menu","menuitem","nav","noframes","ol","optgroup","option","p","param","search","section","summary","table","tbody","td","tfoot","th","thead","title","tr","track","ul"],dm=["pre","script","style","textarea"];var pm={concrete:!0,name:"htmlFlow",resolveTo:J2,tokenize:W2},Z2={partial:!0,tokenize:$2};function J2(e){let t=e.length;for(;t--&&!(e[t][0]==="enter"&&e[t][1].type==="htmlFlow"););return t>1&&e[t-2][1].type==="linePrefix"&&(e[t][1].start=e[t-2][1].start,e[t+1][1].start=e[t-2][1].start,e.splice(t-2,2)),e}function W2(e,t,a){let n=this,l,r,o,i,u;return c;function c(b){return s(b)}function s(b){return e.enter("htmlFlow"),e.enter("htmlFlowData"),e.consume(b),f}function f(b){return b===33?(e.consume(b),p):b===47?(e.consume(b),r=!0,y):b===63?(e.consume(b),l=3,n.interrupt?t:L):tt(b)?(e.consume(b),o=String.fromCharCode(b),k):a(b)}function p(b){return b===45?(e.consume(b),l=2,d):b===91?(e.consume(b),l=5,i=0,h):tt(b)?(e.consume(b),l=4,n.interrupt?t:L):a(b)}function d(b){return b===45?(e.consume(b),n.interrupt?t:L):a(b)}function h(b){let ae="CDATA[";return b===ae.charCodeAt(i++)?(e.consume(b),i===ae.length?n.interrupt?t:te:h):a(b)}function y(b){return tt(b)?(e.consume(b),o=String.fromCharCode(b),k):a(b)}function k(b){if(b===null||b===47||b===62||se(b)){let ae=b===47,xt=o.toLowerCase();return!ae&&!r&&dm.includes(xt)?(l=1,n.interrupt?t(b):te(b)):vL.includes(o.toLowerCase())?(l=6,ae?(e.consume(b),g):n.interrupt?t(b):te(b)):(l=7,n.interrupt&&!n.parser.lazy[n.now().line]?a(b):r?m(b):x(b))}return b===45||He(b)?(e.consume(b),o+=String.fromCharCode(b),k):a(b)}function g(b){return b===62?(e.consume(b),n.interrupt?t:te):a(b)}function m(b){return K(b)?(e.consume(b),m):w(b)}function x(b){return b===47?(e.consume(b),w):b===58||b===95||tt(b)?(e.consume(b),S):K(b)?(e.consume(b),x):w(b)}function S(b){return b===45||b===46||b===58||b===95||He(b)?(e.consume(b),S):I(b)}function I(b){return b===61?(e.consume(b),v):K(b)?(e.consume(b),I):x(b)}function v(b){return b===null||b===60||b===61||b===62||b===96?a(b):b===34||b===39?(e.consume(b),u=b,T):K(b)?(e.consume(b),v):N(b)}function T(b){return b===u?(e.consume(b),u=null,U):b===null||H(b)?a(b):(e.consume(b),T)}function N(b){return b===null||b===34||b===39||b===47||b===60||b===61||b===62||b===96||se(b)?I(b):(e.consume(b),N)}function U(b){return b===47||b===62||K(b)?x(b):a(b)}function w(b){return b===62?(e.consume(b),ne):a(b)}function ne(b){return b===null||H(b)?te(b):K(b)?(e.consume(b),ne):a(b)}function te(b){return b===45&&l===2?(e.consume(b),Q):b===60&&l===1?(e.consume(b),Ce):b===62&&l===4?(e.consume(b),it):b===63&&l===3?(e.consume(b),L):b===93&&l===5?(e.consume(b),St):H(b)&&(l===6||l===7)?(e.exit("htmlFlowData"),e.check(Z2,kt,z)(b)):b===null||H(b)?(e.exit("htmlFlowData"),z(b)):(e.consume(b),te)}function z(b){return e.check(lu,E,kt)(b)}function E(b){return e.enter("lineEnding"),e.consume(b),e.exit("lineEnding"),O}function O(b){return b===null||H(b)?z(b):(e.enter("htmlFlowData"),te(b))}function Q(b){return b===45?(e.consume(b),L):te(b)}function Ce(b){return b===47?(e.consume(b),o="",gt):te(b)}function gt(b){if(b===62){let ae=o.toLowerCase();return dm.includes(ae)?(e.consume(b),it):te(b)}return tt(b)&&o.length<8?(e.consume(b),o+=String.fromCharCode(b),gt):te(b)}function St(b){return b===93?(e.consume(b),L):te(b)}function L(b){return b===62?(e.consume(b),it):b===45&&l===2?(e.consume(b),L):te(b)}function it(b){return b===null||H(b)?(e.exit("htmlFlowData"),kt(b)):(e.consume(b),it)}function kt(b){return e.exit("htmlFlow"),t(b)}}function $2(e,t,a){return n;function n(l){return e.enter("lineEnding"),e.consume(l),e.exit("lineEnding"),e.attempt(_a,t,a)}}var mm={name:"htmlText",tokenize:eA};function eA(e,t,a){let n=this,l,r,o;return i;function i(L){return e.enter("htmlText"),e.enter("htmlTextData"),e.consume(L),u}function u(L){return L===33?(e.consume(L),c):L===47?(e.consume(L),I):L===63?(e.consume(L),x):tt(L)?(e.consume(L),N):a(L)}function c(L){return L===45?(e.consume(L),s):L===91?(e.consume(L),r=0,h):tt(L)?(e.consume(L),m):a(L)}function s(L){return L===45?(e.consume(L),d):a(L)}function f(L){return L===null?a(L):L===45?(e.consume(L),p):H(L)?(o=f,Ce(L)):(e.consume(L),f)}function p(L){return L===45?(e.consume(L),d):f(L)}function d(L){return L===62?Q(L):L===45?p(L):f(L)}function h(L){let it="CDATA[";return L===it.charCodeAt(r++)?(e.consume(L),r===it.length?y:h):a(L)}function y(L){return L===null?a(L):L===93?(e.consume(L),k):H(L)?(o=y,Ce(L)):(e.consume(L),y)}function k(L){return L===93?(e.consume(L),g):y(L)}function g(L){return L===62?Q(L):L===93?(e.consume(L),g):y(L)}function m(L){return L===null||L===62?Q(L):H(L)?(o=m,Ce(L)):(e.consume(L),m)}function x(L){return L===null?a(L):L===63?(e.consume(L),S):H(L)?(o=x,Ce(L)):(e.consume(L),x)}function S(L){return L===62?Q(L):x(L)}function I(L){return tt(L)?(e.consume(L),v):a(L)}function v(L){return L===45||He(L)?(e.consume(L),v):T(L)}function T(L){return H(L)?(o=T,Ce(L)):K(L)?(e.consume(L),T):Q(L)}function N(L){return L===45||He(L)?(e.consume(L),N):L===47||L===62||se(L)?U(L):a(L)}function U(L){return L===47?(e.consume(L),Q):L===58||L===95||tt(L)?(e.consume(L),w):H(L)?(o=U,Ce(L)):K(L)?(e.consume(L),U):Q(L)}function w(L){return L===45||L===46||L===58||L===95||He(L)?(e.consume(L),w):ne(L)}function ne(L){return L===61?(e.consume(L),te):H(L)?(o=ne,Ce(L)):K(L)?(e.consume(L),ne):U(L)}function te(L){return L===null||L===60||L===61||L===62||L===96?a(L):L===34||L===39?(e.consume(L),l=L,z):H(L)?(o=te,Ce(L)):K(L)?(e.consume(L),te):(e.consume(L),E)}function z(L){return L===l?(e.consume(L),l=void 0,O):L===null?a(L):H(L)?(o=z,Ce(L)):(e.consume(L),z)}function E(L){return L===null||L===34||L===39||L===60||L===61||L===96?a(L):L===47||L===62||se(L)?U(L):(e.consume(L),E)}function O(L){return L===47||L===62||se(L)?U(L):a(L)}function Q(L){return L===62?(e.consume(L),e.exit("htmlTextData"),e.exit("htmlText"),t):a(L)}function Ce(L){return e.exit("htmlTextData"),e.enter("lineEnding"),e.consume(L),e.exit("lineEnding"),gt}function gt(L){return K(L)?J(e,St,"linePrefix",n.parser.constructs.disable.null.includes("codeIndented")?void 0:4)(L):St(L)}function St(L){return e.enter("htmlTextData"),o(L)}}var tr={name:"labelEnd",resolveAll:lA,resolveTo:rA,tokenize:oA},tA={tokenize:iA},aA={tokenize:uA},nA={tokenize:sA};function lA(e){let t=-1,a=[];for(;++t<e.length;){let n=e[t][1];if(a.push(e[t]),n.type==="labelImage"||n.type==="labelLink"||n.type==="labelEnd"){let l=n.type==="labelImage"?4:2;n.type="data",t+=l}}return e.length!==a.length&&ot(e,0,e.length,a),e}function rA(e,t){let a=e.length,n=0,l,r,o;for(;a--;){let s=e[a][1];if(l){if(s.type==="link"||s.type==="labelLink"&&s._inactive)break;e[a][0]==="enter"&&s.type==="labelLink"&&(s._inactive=!0)}else if(r){if(e[a][0]==="enter"&&(s.type==="labelImage"||s.type==="labelLink")&&!s._balanced&&(l=a,s.type!=="labelLink")){n=2;break}}else s.type==="labelEnd"&&(r=a)}let i={type:e[l][1].type==="labelLink"?"link":"image",start:{...e[l][1].start},end:{...e[e.length-1][1].end}},u={type:"label",start:{...e[l][1].start},end:{...e[r][1].end}},c={type:"labelText",start:{...e[l+n+2][1].end},end:{...e[r-2][1].start}};return o=[["enter",i,t],["enter",u,t]],o=Mt(o,e.slice(l+1,l+n+3)),o=Mt(o,[["enter",c,t]]),o=Mt(o,dl(t.parser.constructs.insideSpan.null,e.slice(l+n+4,r-3),t)),o=Mt(o,[["exit",c,t],e[r-2],e[r-1],["exit",u,t]]),o=Mt(o,e.slice(r+1)),o=Mt(o,[["exit",i,t]]),ot(e,l,e.length,o),e}function oA(e,t,a){let n=this,l=n._labelStarts,r,o;if(l){for(;l.length>0&&l[l.length-1]._balanced;)l.pop();r=l[l.length-1]}return i;function i(p){return r?r._inactive?f(p):(o=n.parser.defined.includes(Lt(n.sliceSerialize({start:r.end,end:n.now()}))),e.enter("labelEnd"),e.enter("labelMarker"),e.consume(p),e.exit("labelMarker"),e.exit("labelEnd"),u):a(p)}function u(p){return p===40?e.attempt(tA,s,o?s:f)(p):p===91?e.attempt(aA,s,o?c:f)(p):o?s(p):f(p)}function c(p){return e.attempt(nA,s,f)(p)}function s(p){return l.pop(),t(p)}function f(p){return r._balanced=!0,a(p)}}function iA(e,t,a){return n;function n(f){return e.enter("resource"),e.enter("resourceMarker"),e.consume(f),e.exit("resourceMarker"),l}function l(f){return se(f)?er(e,r)(f):r(f)}function r(f){return f===41?s(f):mc(e,o,i,"resourceDestination","resourceDestinationLiteral","resourceDestinationLiteralMarker","resourceDestinationRaw","resourceDestinationString",32)(f)}function o(f){return se(f)?er(e,u)(f):s(f)}function i(f){return a(f)}function u(f){return f===34||f===39||f===40?gc(e,c,a,"resourceTitle","resourceTitleMarker","resourceTitleString")(f):s(f)}function c(f){return se(f)?er(e,s)(f):s(f)}function s(f){return f===41?(e.enter("resourceMarker"),e.consume(f),e.exit("resourceMarker"),e.exit("resource"),t):a(f)}}function uA(e,t,a){let n=this;return l;function l(i){return hc.call(n,e,r,o,"reference","referenceMarker","referenceString")(i)}function r(i){return n.parser.defined.includes(Lt(n.sliceSerialize(n.events[n.events.length-1][1]).slice(1,-1)))?t(i):a(i)}function o(i){return a(i)}}function sA(e,t,a){return n;function n(r){return e.enter("reference"),e.enter("referenceMarker"),e.consume(r),e.exit("referenceMarker"),l}function l(r){return r===93?(e.enter("referenceMarker"),e.consume(r),e.exit("referenceMarker"),e.exit("reference"),t):a(r)}}var hm={name:"labelStartImage",resolveAll:tr.resolveAll,tokenize:cA};function cA(e,t,a){let n=this,l;return r;function r(u){return e.enter("labelImage"),e.enter("labelImageMarker"),e.consume(u),e.exit("labelImageMarker"),o}function o(u){return u===91?(e.enter("labelMarker"),e.consume(u),e.exit("labelMarker"),l=e.exit("labelImage"),i):a(u)}function i(u){return u===94&&"_hiddenFootnoteSupport"in n.parser.constructs?a(u):(n._labelStarts=n._labelStarts||[],n._labelStarts.push(l),t(u))}}var gm={name:"labelStartLink",resolveAll:tr.resolveAll,tokenize:fA};function fA(e,t,a){let n=this,l;return r;function r(i){return e.enter("labelLink"),e.enter("labelMarker"),e.consume(i),e.exit("labelMarker"),l=e.exit("labelLink"),o}function o(i){return i===94&&"_hiddenFootnoteSupport"in n.parser.constructs?a(i):(n._labelStarts=n._labelStarts||[],n._labelStarts.push(l),t(i))}}var iu={name:"lineEnding",tokenize:dA};function dA(e,t){return a;function a(n){return e.enter("lineEnding"),e.consume(n),e.exit("lineEnding"),J(e,t,"linePrefix")}}var ar={name:"thematicBreak",tokenize:pA};function pA(e,t,a){let n=0,l;return r;function r(c){return e.enter("thematicBreak"),o(c)}function o(c){return l=c,i(c)}function i(c){return c===l?(e.enter("thematicBreakSequence"),u(c)):n>=3&&(c===null||H(c))?(e.exit("thematicBreak"),t(c)):a(c)}function u(c){return c===l?(e.consume(c),n++,u):(e.exit("thematicBreakSequence"),K(c)?J(e,i,"whitespace")(c):i(c))}}var vt={continuation:{tokenize:xA},exit:bA,name:"list",tokenize:gA},mA={partial:!0,tokenize:LA},hA={partial:!0,tokenize:yA};function gA(e,t,a){let n=this,l=n.events[n.events.length-1],r=l&&l[1].type==="linePrefix"?l[2].sliceSerialize(l[1],!0).length:0,o=0;return i;function i(d){let h=n.containerState.type||(d===42||d===43||d===45?"listUnordered":"listOrdered");if(h==="listUnordered"?!n.containerState.marker||d===n.containerState.marker:au(d)){if(n.containerState.type||(n.containerState.type=h,e.enter(h,{_container:!0})),h==="listUnordered")return e.enter("listItemPrefix"),d===42||d===45?e.check(ar,a,c)(d):c(d);if(!n.interrupt||d===49)return e.enter("listItemPrefix"),e.enter("listItemValue"),u(d)}return a(d)}function u(d){return au(d)&&++o<10?(e.consume(d),u):(!n.interrupt||o<2)&&(n.containerState.marker?d===n.containerState.marker:d===41||d===46)?(e.exit("listItemValue"),c(d)):a(d)}function c(d){return e.enter("listItemMarker"),e.consume(d),e.exit("listItemMarker"),n.containerState.marker=n.containerState.marker||d,e.check(_a,n.interrupt?a:s,e.attempt(mA,p,f))}function s(d){return n.containerState.initialBlankLine=!0,r++,p(d)}function f(d){return K(d)?(e.enter("listItemPrefixWhitespace"),e.consume(d),e.exit("listItemPrefixWhitespace"),p):a(d)}function p(d){return n.containerState.size=r+n.sliceSerialize(e.exit("listItemPrefix"),!0).length,t(d)}}function xA(e,t,a){let n=this;return n.containerState._closeFlow=void 0,e.check(_a,l,r);function l(i){return n.containerState.furtherBlankLines=n.containerState.furtherBlankLines||n.containerState.initialBlankLine,J(e,t,"listItemIndent",n.containerState.size+1)(i)}function r(i){return n.containerState.furtherBlankLines||!K(i)?(n.containerState.furtherBlankLines=void 0,n.containerState.initialBlankLine=void 0,o(i)):(n.containerState.furtherBlankLines=void 0,n.containerState.initialBlankLine=void 0,e.attempt(hA,t,o)(i))}function o(i){return n.containerState._closeFlow=!0,n.interrupt=void 0,J(e,e.attempt(vt,t,a),"linePrefix",n.parser.constructs.disable.null.includes("codeIndented")?void 0:4)(i)}}function yA(e,t,a){let n=this;return J(e,l,"listItemIndent",n.containerState.size+1);function l(r){let o=n.events[n.events.length-1];return o&&o[1].type==="listItemIndent"&&o[2].sliceSerialize(o[1],!0).length===n.containerState.size?t(r):a(r)}}function bA(e){e.exit(this.containerState.type)}function LA(e,t,a){let n=this;return J(e,l,"listItemPrefixWhitespace",n.parser.constructs.disable.null.includes("codeIndented")?void 0:5);function l(r){let o=n.events[n.events.length-1];return!K(r)&&o&&o[1].type==="listItemPrefixWhitespace"?t(r):a(r)}}var xc={name:"setextUnderline",resolveTo:vA,tokenize:CA};function vA(e,t){let a=new wn,n=e.length,l,r,o;for(;n--;)if(e[n][0]==="enter"){if(e[n][1].type==="content"){l=n;break}e[n][1].type==="paragraph"&&(r=n)}else e[n][1].type==="content"&&a.add(n,1,[]),!o&&e[n][1].type==="definition"&&(o=n);let i={type:"setextHeading",start:{...e[l][1].start},end:{...e[e.length-1][1].end}};return e[r][1].type="setextHeadingText",o?(a.add(r,0,[["enter",i,t]]),a.add(o+1,0,[["exit",e[l][1],t]]),e[l][1].end={...e[o][1].end}):e[l][1]=i,a.add(e.length,0,[["exit",i,t]]),a.consume(e),e}function CA(e,t,a){let n=this,l;return r;function r(c){let s=n.events.length,f;for(;s--;)if(n.events[s][1].type!=="lineEnding"&&n.events[s][1].type!=="linePrefix"&&n.events[s][1].type!=="content"){f=n.events[s][1].type==="paragraph";break}return!n.parser.lazy[n.now().line]&&(n.interrupt||f)?(e.enter("setextHeadingLine"),l=c,o(c)):a(c)}function o(c){return e.enter("setextHeadingLineSequence"),i(c)}function i(c){return c===l?(e.consume(c),i):(e.exit("setextHeadingLineSequence"),K(c)?J(e,u,"lineSuffix")(c):u(c))}function u(c){return c===null||H(c)?(e.exit("setextHeadingLine"),t(c)):a(c)}}var CL={tokenize:SA};function SA(e){let t=this,a=e.attempt(_a,n,e.attempt(this.parser.constructs.flowInitial,l,J(e,e.attempt(this.parser.constructs.flow,l,e.attempt(um,l)),"linePrefix")));return a;function n(r){if(r===null){e.consume(r);return}return e.enter("lineEndingBlank"),e.consume(r),e.exit("lineEndingBlank"),t.currentConstruct=void 0,a}function l(r){if(r===null){e.consume(r);return}return e.enter("lineEnding"),e.consume(r),e.exit("lineEnding"),t.currentConstruct=void 0,a}}var SL={resolveAll:AL()},kL=IL("string"),wL=IL("text");function IL(e){return{resolveAll:AL(e==="text"?kA:void 0),tokenize:t};function t(a){let n=this,l=this.parser.constructs[e],r=a.attempt(l,o,i);return o;function o(s){return c(s)?r(s):i(s)}function i(s){if(s===null){a.consume(s);return}return a.enter("data"),a.consume(s),u}function u(s){return c(s)?(a.exit("data"),r(s)):(a.consume(s),u)}function c(s){if(s===null)return!0;let f=l[s],p=-1;if(f)for(;++p<f.length;){let d=f[p];if(!d.previous||d.previous.call(n,n.previous))return!0}return!1}}}function AL(e){return t;function t(a,n){let l=-1,r;for(;++l<=a.length;)r===void 0?a[l]&&a[l][1].type==="data"&&(r=l,l++):(!a[l]||a[l][1].type!=="data")&&(l!==r+2&&(a[r][1].end=a[l-1][1].end,a.splice(r+2,l-r-2),l=r+2),r=void 0);return e?e(a,n):a}}function kA(e,t){let a=new wn,n=0;for(;++n<=e.length;)if((n===e.length||e[n][1].type==="lineEnding")&&e[n-1][1].type==="data"){let l=e[n-1][1],r=t.sliceStream(l),o=r.length,i=-1,u=0,c;for(;o--;){let s=r[o];if(typeof s=="string"){for(i=s.length;s.charCodeAt(i-1)===32;)u++,i--;if(i)break;i=-1}else if(s===-2)c=!0,u++;else if(s!==-1){o++;break}}if(t._contentTypeTextTrailing&&n===e.length&&(u=0),u){let s={type:n===e.length||c||u<2?"lineSuffix":"hardBreakTrailing",start:{_bufferIndex:o?i:l.start._bufferIndex+i,_index:l.start._index+o,line:l.end.line,column:l.end.column-u,offset:l.end.offset-u},end:{...l.end}};l.end={...s.start},l.start.offset===l.end.offset?Object.assign(l,s):a.add(n,0,[["enter",s,t],["exit",s,t]])}n++}return a.consume(e),e}var xm={};Nh(xm,{attentionMarkers:()=>zA,contentInitial:()=>IA,disable:()=>BA,document:()=>wA,flow:()=>TA,flowInitial:()=>AA,insideSpan:()=>EA,string:()=>DA,text:()=>MA});var wA={42:vt,43:vt,45:vt,48:vt,49:vt,50:vt,51:vt,52:vt,53:vt,54:vt,55:vt,56:vt,57:vt,62:uc},IA={91:sm},AA={[-2]:ru,[-1]:ru,32:ru},TA={35:fm,42:ar,45:[xc,ar],60:pm,61:xc,95:ar,96:fc,126:fc},DA={38:cc,92:sc},MA={[-5]:iu,[-4]:iu,[-3]:iu,33:hm,38:cc,42:nu,60:[om,mm],91:gm,92:[cm,sc],93:tr,95:nu,96:im},EA={null:[nu,SL]},zA={null:[42,95]},BA={null:[]};function TL(e,t,a){let n={_bufferIndex:-1,_index:0,line:a&&a.line||1,column:a&&a.column||1,offset:a&&a.offset||0},l={},r=[],o=[],i=[],u=!0,c={attempt:U(T),check:U(N),consume:S,enter:I,exit:v,interrupt:U(N,{interrupt:!0})},s={code:null,containerState:{},defineSkip:g,events:[],now:k,parser:e,previous:null,sliceSerialize:h,sliceStream:y,write:d},f=t.tokenize.call(s,c),p;return t.resolveAll&&r.push(t),s;function d(z){return o=Mt(o,z),m(),o[o.length-1]!==null?[]:(w(t,0),s.events=dl(r,s.events,s),s.events)}function h(z,E){return OA(y(z),E)}function y(z){return RA(o,z)}function k(){let{_bufferIndex:z,_index:E,line:O,column:Q,offset:Ce}=n;return{_bufferIndex:z,_index:E,line:O,column:Q,offset:Ce}}function g(z){l[z.line]=z.column,te()}function m(){for(;n._index<o.length;){let z=o[n._index];if(typeof z=="string"){let E=n._index;for(n._bufferIndex<0&&(n._bufferIndex=0);n._index===E&&n._bufferIndex<z.length;)x(z.charCodeAt(n._bufferIndex))}else x(z)}}function x(z){u=void 0,p=z,f=f(z)}function S(z){H(z)?(n.line++,n.column=1,n.offset+=z===-3?2:1,te()):z!==-1&&(n.column++,n.offset++),n._bufferIndex<0?n._index++:(n._bufferIndex++,n._bufferIndex===o[n._index].length&&(n._bufferIndex=-1,n._index++)),s.previous=z,u=!0}function I(z,E){let O=E||{};return O.type=z,O.start=k(),s.events.push(["enter",O,s]),i.push(O),O}function v(z){let E=i.pop();return E.end=k(),s.events.push(["exit",E,s]),E}function T(z,E){w(z,E.from)}function N(z,E){E.restore()}function U(z,E){return O;function O(Q,Ce,gt){let St,L,it,kt;return Array.isArray(Q)?ae(Q):"tokenize"in Q?ae([Q]):b(Q);function b(ut){return vo;function vo(ja){let gl=ja!==null&&ut[ja],fr=ja!==null&&ut.null,Wc=[...Array.isArray(gl)?gl:gl?[gl]:[],...Array.isArray(fr)?fr:fr?[fr]:[]];return ae(Wc)(ja)}}function ae(ut){return St=ut,L=0,ut.length===0?gt:xt(ut[L])}function xt(ut){return vo;function vo(ja){return kt=ne(),it=ut,ut.partial||(s.currentConstruct=ut),ut.name&&s.parser.constructs.disable.null.includes(ut.name)?Tn(ja):ut.tokenize.call(E?Object.assign(Object.create(s),E):s,c,xa,Tn)(ja)}}function xa(ut){return u=!0,z(it,kt),Ce}function Tn(ut){return u=!0,kt.restore(),++L<St.length?xt(St[L]):gt}}}function w(z,E){z.resolveAll&&!r.includes(z)&&r.push(z),z.resolve&&ot(s.events,E,s.events.length-E,z.resolve(s.events.slice(E),s)),z.resolveTo&&(s.events=z.resolveTo(s.events,s))}function ne(){let z=k(),E=s.previous,O=s.currentConstruct,Q=s.events.length,Ce=Array.from(i);return{from:Q,restore:gt};function gt(){n=z,s.previous=E,s.currentConstruct=O,s.events.length=Q,i=Ce,te()}}function te(){n.line in l&&n.column<2&&(n.column=l[n.line],n.offset+=l[n.line]-1)}}function RA(e,t){let a=t.start._index,n=t.start._bufferIndex,l=t.end._index,r=t.end._bufferIndex,o;if(a===l)o=[e[a].slice(n,r)];else{if(o=e.slice(a,l),n>-1){let i=o[0];typeof i=="string"?o[0]=i.slice(n):o.shift()}r>0&&o.push(e[l].slice(0,r))}return o}function OA(e,t){let a=-1,n=[],l;for(;++a<e.length;){let r=e[a],o;if(typeof r=="string")o=r;else switch(r){case-5:{o="\r";break}case-4:{o=`
`;break}case-3:{o=`\r
`;break}case-2:{o=t?" ":"	";break}case-1:{if(!t&&l)continue;o=" ";break}default:o=String.fromCharCode(r)}l=r===-2,n.push(o)}return n.join("")}function ym(e){let n={constructs:oc([xm,...(e||{}).extensions||[]]),content:l(gL),defined:[],document:l(bL),flow:l(CL),lazy:{},string:l(kL),text:l(wL)};return n;function l(r){return o;function o(i){return TL(n,r,i)}}}function bm(e){for(;!pc(e););return e}var DL=/[\0\t\n\r]/g;function Lm(){let e=1,t="",a=!0,n;return l;function l(r,o,i){r=t+(typeof r=="string"?r.toString():new TextDecoder(o||void 0).decode(r));let u=[],c=0;for(t="",a&&(r.charCodeAt(0)===65279&&c++,a=void 0);c<r.length;){DL.lastIndex=c;let s=DL.exec(r),f=s&&s.index!==void 0?s.index:r.length,p=r.charCodeAt(f);if(!s){t=r.slice(c);break}if(p===10&&c===f&&n)u.push(-3),n=void 0;else switch(n&&(u.push(-5),n=void 0),c<f&&(u.push(r.slice(c,f)),e+=f-c),p){case 0:{u.push(65533),e++;break}case 9:{let d=Math.ceil(e/4)*4;for(u.push(-2);e++<d;)u.push(-1);break}case 10:{u.push(-4),e=1;break}default:n=!0,e=1}c=f+1}return i&&(n&&u.push(-5),t&&u.push(t),u.push(null)),u}}var NA=/\\([!-/:-@[-`{-~])|&(#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/gi;function ML(e){return e.replace(NA,qA)}function qA(e,t,a){if(t)return t;if(a.charCodeAt(0)===35){let l=a.charCodeAt(1),r=l===120||l===88;return ic(a.slice(r?2:1),r?16:10)}return co(a)||e}var zL={}.hasOwnProperty;function vm(e,t,a){return t&&typeof t=="object"&&(a=t,t=void 0),UA(a)(bm(ym(a).document().write(Lm()(e,t,!0))))}function UA(e){let t={transforms:[],canContainEols:["emphasis","fragment","heading","paragraph","strong"],enter:{autolink:r(Rh),autolinkProtocol:U,autolinkEmail:U,atxHeading:r(Eh),blockQuote:r(ja),characterEscape:U,characterReference:U,codeFenced:r(gl),codeFencedFenceInfo:o,codeFencedFenceMeta:o,codeIndented:r(gl,o),codeText:r(fr,o),codeTextData:U,data:U,codeFlowValue:U,definition:r(Wc),definitionDestinationString:o,definitionLabelString:o,definitionTitleString:o,emphasis:r(W0),hardBreakEscape:r(zh),hardBreakTrailing:r(zh),htmlFlow:r(Bh,o),htmlFlowData:U,htmlText:r(Bh,o),htmlTextData:U,image:r($0),label:o,link:r(Rh),listItem:r(eC),listItemValue:p,listOrdered:r(Oh,f),listUnordered:r(Oh),paragraph:r(tC),reference:b,referenceString:o,resourceDestinationString:o,resourceTitleString:o,setextHeading:r(Eh),strong:r(aC),thematicBreak:r(lC)},exit:{atxHeading:u(),atxHeadingSequence:I,autolink:u(),autolinkEmail:vo,autolinkProtocol:ut,blockQuote:u(),characterEscapeValue:w,characterReferenceMarkerHexadecimal:xt,characterReferenceMarkerNumeric:xt,characterReferenceValue:xa,characterReference:Tn,codeFenced:u(k),codeFencedFence:y,codeFencedFenceInfo:d,codeFencedFenceMeta:h,codeFlowValue:w,codeIndented:u(g),codeText:u(O),codeTextData:w,data:w,definition:u(),definitionDestinationString:S,definitionLabelString:m,definitionTitleString:x,emphasis:u(),hardBreakEscape:u(te),hardBreakTrailing:u(te),htmlFlow:u(z),htmlFlowData:w,htmlText:u(E),htmlTextData:w,image:u(Ce),label:St,labelText:gt,lineEnding:ne,link:u(Q),listItem:u(),listOrdered:u(),listUnordered:u(),paragraph:u(),referenceString:ae,resourceDestinationString:L,resourceTitleString:it,resource:kt,setextHeading:u(N),setextHeadingLineSequence:T,setextHeadingText:v,strong:u(),thematicBreak:u()}};BL(t,(e||{}).mdastExtensions||[]);let a={};return n;function n(D){let q={type:"root",children:[]},le={stack:[q],tokenStack:[],config:t,enter:i,exit:c,buffer:o,resume:s,data:a},he=[],Ae=-1;for(;++Ae<D.length;)if(D[Ae][1].type==="listOrdered"||D[Ae][1].type==="listUnordered")if(D[Ae][0]==="enter")he.push(Ae);else{let ya=he.pop();Ae=l(D,ya,Ae)}for(Ae=-1;++Ae<D.length;){let ya=t[D[Ae][0]];zL.call(ya,D[Ae][1].type)&&ya[D[Ae][1].type].call(Object.assign({sliceSerialize:D[Ae][2].sliceSerialize},le),D[Ae][1])}if(le.tokenStack.length>0){let ya=le.tokenStack[le.tokenStack.length-1];(ya[1]||EL).call(le,void 0,ya[0])}for(q.position={start:pl(D.length>0?D[0][1].start:{line:1,column:1,offset:0}),end:pl(D.length>0?D[D.length-2][1].end:{line:1,column:1,offset:0})},Ae=-1;++Ae<t.transforms.length;)q=t.transforms[Ae](q)||q;return q}function l(D,q,le){let he=q-1,Ae=-1,ya=!1,xl,Xa,Co,So;for(;++he<=le;){let _t=D[he];switch(_t[1].type){case"listUnordered":case"listOrdered":case"blockQuote":{_t[0]==="enter"?Ae++:Ae--,So=void 0;break}case"lineEndingBlank":{_t[0]==="enter"&&(xl&&!So&&!Ae&&!Co&&(Co=he),So=void 0);break}case"linePrefix":case"listItemValue":case"listItemMarker":case"listItemPrefix":case"listItemPrefixWhitespace":break;default:So=void 0}if(!Ae&&_t[0]==="enter"&&_t[1].type==="listItemPrefix"||Ae===-1&&_t[0]==="exit"&&(_t[1].type==="listUnordered"||_t[1].type==="listOrdered")){if(xl){let dr=he;for(Xa=void 0;dr--;){let Qa=D[dr];if(Qa[1].type==="lineEnding"||Qa[1].type==="lineEndingBlank"){if(Qa[0]==="exit")continue;Xa&&(D[Xa][1].type="lineEndingBlank",ya=!0),Qa[1].type="lineEnding",Xa=dr}else if(!(Qa[1].type==="linePrefix"||Qa[1].type==="blockQuotePrefix"||Qa[1].type==="blockQuotePrefixWhitespace"||Qa[1].type==="blockQuoteMarker"||Qa[1].type==="listItemIndent"))break}Co&&(!Xa||Co<Xa)&&(xl._spread=!0),xl.end=Object.assign({},Xa?D[Xa][1].start:_t[1].end),D.splice(Xa||he,0,["exit",xl,_t[2]]),he++,le++}if(_t[1].type==="listItemPrefix"){let dr={type:"listItem",_spread:!1,start:Object.assign({},_t[1].start),end:void 0};xl=dr,D.splice(he,0,["enter",dr,_t[2]]),he++,le++,Co=void 0,So=!0}}}return D[q][1]._spread=ya,le}function r(D,q){return le;function le(he){i.call(this,D(he),he),q&&q.call(this,he)}}function o(){this.stack.push({type:"fragment",children:[]})}function i(D,q,le){this.stack[this.stack.length-1].children.push(D),this.stack.push(D),this.tokenStack.push([q,le||void 0]),D.position={start:pl(q.start),end:void 0}}function u(D){return q;function q(le){D&&D.call(this,le),c.call(this,le)}}function c(D,q){let le=this.stack.pop(),he=this.tokenStack.pop();if(he)he[0].type!==D.type&&(q?q.call(this,D,he[0]):(he[1]||EL).call(this,D,he[0]));else throw new Error("Cannot close `"+D.type+"` ("+cl({start:D.start,end:D.end})+"): it\u2019s not open");le.position.end=pl(D.end)}function s(){return Jl(this.stack.pop())}function f(){this.data.expectingFirstListItemValue=!0}function p(D){if(this.data.expectingFirstListItemValue){let q=this.stack[this.stack.length-2];q.start=Number.parseInt(this.sliceSerialize(D),10),this.data.expectingFirstListItemValue=void 0}}function d(){let D=this.resume(),q=this.stack[this.stack.length-1];q.lang=D}function h(){let D=this.resume(),q=this.stack[this.stack.length-1];q.meta=D}function y(){this.data.flowCodeInside||(this.buffer(),this.data.flowCodeInside=!0)}function k(){let D=this.resume(),q=this.stack[this.stack.length-1];q.value=D.replace(/^(\r?\n|\r)|(\r?\n|\r)$/g,""),this.data.flowCodeInside=void 0}function g(){let D=this.resume(),q=this.stack[this.stack.length-1];q.value=D.replace(/(\r?\n|\r)$/g,"")}function m(D){let q=this.resume(),le=this.stack[this.stack.length-1];le.label=q,le.identifier=Lt(this.sliceSerialize(D)).toLowerCase()}function x(){let D=this.resume(),q=this.stack[this.stack.length-1];q.title=D}function S(){let D=this.resume(),q=this.stack[this.stack.length-1];q.url=D}function I(D){let q=this.stack[this.stack.length-1];if(!q.depth){let le=this.sliceSerialize(D).length;q.depth=le}}function v(){this.data.setextHeadingSlurpLineEnding=!0}function T(D){let q=this.stack[this.stack.length-1];q.depth=this.sliceSerialize(D).codePointAt(0)===61?1:2}function N(){this.data.setextHeadingSlurpLineEnding=void 0}function U(D){let le=this.stack[this.stack.length-1].children,he=le[le.length-1];(!he||he.type!=="text")&&(he=nC(),he.position={start:pl(D.start),end:void 0},le.push(he)),this.stack.push(he)}function w(D){let q=this.stack.pop();q.value+=this.sliceSerialize(D),q.position.end=pl(D.end)}function ne(D){let q=this.stack[this.stack.length-1];if(this.data.atHardBreak){let le=q.children[q.children.length-1];le.position.end=pl(D.end),this.data.atHardBreak=void 0;return}!this.data.setextHeadingSlurpLineEnding&&t.canContainEols.includes(q.type)&&(U.call(this,D),w.call(this,D))}function te(){this.data.atHardBreak=!0}function z(){let D=this.resume(),q=this.stack[this.stack.length-1];q.value=D}function E(){let D=this.resume(),q=this.stack[this.stack.length-1];q.value=D}function O(){let D=this.resume(),q=this.stack[this.stack.length-1];q.value=D}function Q(){let D=this.stack[this.stack.length-1];if(this.data.inReference){let q=this.data.referenceType||"shortcut";D.type+="Reference",D.referenceType=q,delete D.url,delete D.title}else delete D.identifier,delete D.label;this.data.referenceType=void 0}function Ce(){let D=this.stack[this.stack.length-1];if(this.data.inReference){let q=this.data.referenceType||"shortcut";D.type+="Reference",D.referenceType=q,delete D.url,delete D.title}else delete D.identifier,delete D.label;this.data.referenceType=void 0}function gt(D){let q=this.sliceSerialize(D),le=this.stack[this.stack.length-2];le.label=ML(q),le.identifier=Lt(q).toLowerCase()}function St(){let D=this.stack[this.stack.length-1],q=this.resume(),le=this.stack[this.stack.length-1];if(this.data.inReference=!0,le.type==="link"){let he=D.children;le.children=he}else le.alt=q}function L(){let D=this.resume(),q=this.stack[this.stack.length-1];q.url=D}function it(){let D=this.resume(),q=this.stack[this.stack.length-1];q.title=D}function kt(){this.data.inReference=void 0}function b(){this.data.referenceType="collapsed"}function ae(D){let q=this.resume(),le=this.stack[this.stack.length-1];le.label=q,le.identifier=Lt(this.sliceSerialize(D)).toLowerCase(),this.data.referenceType="full"}function xt(D){this.data.characterReferenceType=D.type}function xa(D){let q=this.sliceSerialize(D),le=this.data.characterReferenceType,he;le?(he=ic(q,le==="characterReferenceMarkerNumeric"?10:16),this.data.characterReferenceType=void 0):he=co(q);let Ae=this.stack[this.stack.length-1];Ae.value+=he}function Tn(D){let q=this.stack.pop();q.position.end=pl(D.end)}function ut(D){w.call(this,D);let q=this.stack[this.stack.length-1];q.url=this.sliceSerialize(D)}function vo(D){w.call(this,D);let q=this.stack[this.stack.length-1];q.url="mailto:"+this.sliceSerialize(D)}function ja(){return{type:"blockquote",children:[]}}function gl(){return{type:"code",lang:null,meta:null,value:""}}function fr(){return{type:"inlineCode",value:""}}function Wc(){return{type:"definition",identifier:"",label:null,title:null,url:""}}function W0(){return{type:"emphasis",children:[]}}function Eh(){return{type:"heading",depth:0,children:[]}}function zh(){return{type:"break"}}function Bh(){return{type:"html",value:""}}function $0(){return{type:"image",title:null,url:"",alt:null}}function Rh(){return{type:"link",title:null,url:"",children:[]}}function Oh(D){return{type:"list",ordered:D.type==="listOrdered",start:null,spread:D._spread,children:[]}}function eC(D){return{type:"listItem",spread:D._spread,checked:null,children:[]}}function tC(){return{type:"paragraph",children:[]}}function aC(){return{type:"strong",children:[]}}function nC(){return{type:"text",value:""}}function lC(){return{type:"thematicBreak"}}}function pl(e){return{line:e.line,column:e.column,offset:e.offset}}function BL(e,t){let a=-1;for(;++a<t.length;){let n=t[a];Array.isArray(n)?BL(e,n):FA(e,n)}}function FA(e,t){let a;for(a in t)if(zL.call(t,a))switch(a){case"canContainEols":{let n=t[a];n&&e[a].push(...n);break}case"transforms":{let n=t[a];n&&e[a].push(...n);break}case"enter":case"exit":{let n=t[a];n&&Object.assign(e[a],n);break}}}function EL(e,t){throw e?new Error("Cannot close `"+e.type+"` ("+cl({start:e.start,end:e.end})+"): a different token (`"+t.type+"`, "+cl({start:t.start,end:t.end})+") is open"):new Error("Cannot close document, a token (`"+t.type+"`, "+cl({start:t.start,end:t.end})+") is still open")}function yc(e){let t=this;t.parser=a;function a(n){return vm(n,{...t.data("settings"),...e,extensions:t.data("micromarkExtensions")||[],mdastExtensions:t.data("fromMarkdownExtensions")||[]})}}function RL(e,t){let a={type:"element",tagName:"blockquote",properties:{},children:e.wrap(e.all(t),!0)};return e.patch(t,a),e.applyData(t,a)}function OL(e,t){let a={type:"element",tagName:"br",properties:{},children:[]};return e.patch(t,a),[e.applyData(t,a),{type:"text",value:`
`}]}function NL(e,t){let a=t.value?t.value+`
`:"",n={},l=t.lang?t.lang.split(/\s+/):[];l.length>0&&(n.className=["language-"+l[0]]);let r={type:"element",tagName:"code",properties:n,children:[{type:"text",value:a}]};return t.meta&&(r.data={meta:t.meta}),e.patch(t,r),r=e.applyData(t,r),r={type:"element",tagName:"pre",properties:{},children:[r]},e.patch(t,r),r}function qL(e,t){let a={type:"element",tagName:"del",properties:{},children:e.all(t)};return e.patch(t,a),e.applyData(t,a)}function UL(e,t){let a={type:"element",tagName:"em",properties:{},children:e.all(t)};return e.patch(t,a),e.applyData(t,a)}function FL(e,t){let a=typeof e.options.clobberPrefix=="string"?e.options.clobberPrefix:"user-content-",n=String(t.identifier).toUpperCase(),l=ga(n.toLowerCase()),r=e.footnoteOrder.indexOf(n),o,i=e.footnoteCounts.get(n);i===void 0?(i=0,e.footnoteOrder.push(n),o=e.footnoteOrder.length):o=r+1,i+=1,e.footnoteCounts.set(n,i);let u={type:"element",tagName:"a",properties:{href:"#"+a+"fn-"+l,id:a+"fnref-"+l+(i>1?"-"+i:""),dataFootnoteRef:!0,ariaDescribedBy:["footnote-label"]},children:[{type:"text",value:String(o)}]};e.patch(t,u);let c={type:"element",tagName:"sup",properties:{},children:[u]};return e.patch(t,c),e.applyData(t,c)}function PL(e,t){let a={type:"element",tagName:"h"+t.depth,properties:{},children:e.all(t)};return e.patch(t,a),e.applyData(t,a)}function HL(e,t){if(e.options.allowDangerousHtml){let a={type:"raw",value:t.value};return e.patch(t,a),e.applyData(t,a)}}function bc(e,t){let a=t.referenceType,n="]";if(a==="collapsed"?n+="[]":a==="full"&&(n+="["+(t.label||t.identifier)+"]"),t.type==="imageReference")return[{type:"text",value:"!["+t.alt+n}];let l=e.all(t),r=l[0];r&&r.type==="text"?r.value="["+r.value:l.unshift({type:"text",value:"["});let o=l[l.length-1];return o&&o.type==="text"?o.value+=n:l.push({type:"text",value:n}),l}function _L(e,t){let a=String(t.identifier).toUpperCase(),n=e.definitionById.get(a);if(!n)return bc(e,t);let l={src:ga(n.url||""),alt:t.alt};n.title!==null&&n.title!==void 0&&(l.title=n.title);let r={type:"element",tagName:"img",properties:l,children:[]};return e.patch(t,r),e.applyData(t,r)}function GL(e,t){let a={src:ga(t.url)};t.alt!==null&&t.alt!==void 0&&(a.alt=t.alt),t.title!==null&&t.title!==void 0&&(a.title=t.title);let n={type:"element",tagName:"img",properties:a,children:[]};return e.patch(t,n),e.applyData(t,n)}function VL(e,t){let a={type:"text",value:t.value.replace(/\r?\n|\r/g," ")};e.patch(t,a);let n={type:"element",tagName:"code",properties:{},children:[a]};return e.patch(t,n),e.applyData(t,n)}function jL(e,t){let a=String(t.identifier).toUpperCase(),n=e.definitionById.get(a);if(!n)return bc(e,t);let l={href:ga(n.url||"")};n.title!==null&&n.title!==void 0&&(l.title=n.title);let r={type:"element",tagName:"a",properties:l,children:e.all(t)};return e.patch(t,r),e.applyData(t,r)}function XL(e,t){let a={href:ga(t.url)};t.title!==null&&t.title!==void 0&&(a.title=t.title);let n={type:"element",tagName:"a",properties:a,children:e.all(t)};return e.patch(t,n),e.applyData(t,n)}function QL(e,t,a){let n=e.all(t),l=a?PA(a):YL(t),r={},o=[];if(typeof t.checked=="boolean"){let s=n[0],f;s&&s.type==="element"&&s.tagName==="p"?f=s:(f={type:"element",tagName:"p",properties:{},children:[]},n.unshift(f)),f.children.length>0&&f.children.unshift({type:"text",value:" "}),f.children.unshift({type:"element",tagName:"input",properties:{type:"checkbox",checked:t.checked,disabled:!0},children:[]}),r.className=["task-list-item"]}let i=-1;for(;++i<n.length;){let s=n[i];(l||i!==0||s.type!=="element"||s.tagName!=="p")&&o.push({type:"text",value:`
`}),s.type==="element"&&s.tagName==="p"&&!l?o.push(...s.children):o.push(s)}let u=n[n.length-1];u&&(l||u.type!=="element"||u.tagName!=="p")&&o.push({type:"text",value:`
`});let c={type:"element",tagName:"li",properties:r,children:o};return e.patch(t,c),e.applyData(t,c)}function PA(e){let t=!1;if(e.type==="list"){t=e.spread||!1;let a=e.children,n=-1;for(;!t&&++n<a.length;)t=YL(a[n])}return t}function YL(e){let t=e.spread;return t??e.children.length>1}function KL(e,t){let a={},n=e.all(t),l=-1;for(typeof t.start=="number"&&t.start!==1&&(a.start=t.start);++l<n.length;){let o=n[l];if(o.type==="element"&&o.tagName==="li"&&o.properties&&Array.isArray(o.properties.className)&&o.properties.className.includes("task-list-item")){a.className=["contains-task-list"];break}}let r={type:"element",tagName:t.ordered?"ol":"ul",properties:a,children:e.wrap(n,!0)};return e.patch(t,r),e.applyData(t,r)}function ZL(e,t){let a={type:"element",tagName:"p",properties:{},children:e.all(t)};return e.patch(t,a),e.applyData(t,a)}function JL(e,t){let a={type:"root",children:e.wrap(e.all(t))};return e.patch(t,a),e.applyData(t,a)}function WL(e,t){let a={type:"element",tagName:"strong",properties:{},children:e.all(t)};return e.patch(t,a),e.applyData(t,a)}function $L(e,t){let a=e.all(t),n=a.shift(),l=[];if(n){let o={type:"element",tagName:"thead",properties:{},children:e.wrap([n],!0)};e.patch(t.children[0],o),l.push(o)}if(a.length>0){let o={type:"element",tagName:"tbody",properties:{},children:e.wrap(a,!0)},i=so(t.children[1]),u=rc(t.children[t.children.length-1]);i&&u&&(o.position={start:i,end:u}),l.push(o)}let r={type:"element",tagName:"table",properties:{},children:e.wrap(l,!0)};return e.patch(t,r),e.applyData(t,r)}function ev(e,t,a){let n=a?a.children:void 0,r=(n?n.indexOf(t):1)===0?"th":"td",o=a&&a.type==="table"?a.align:void 0,i=o?o.length:t.children.length,u=-1,c=[];for(;++u<i;){let f=t.children[u],p={},d=o?o[u]:void 0;d&&(p.align=d);let h={type:"element",tagName:r,properties:p,children:[]};f&&(h.children=e.all(f),e.patch(f,h),h=e.applyData(f,h)),c.push(h)}let s={type:"element",tagName:"tr",properties:{},children:e.wrap(c,!0)};return e.patch(t,s),e.applyData(t,s)}function tv(e,t){let a={type:"element",tagName:"td",properties:{},children:e.all(t)};return e.patch(t,a),e.applyData(t,a)}function nv(e){let t=String(e),a=/\r?\n|\r/g,n=a.exec(t),l=0,r=[];for(;n;)r.push(av(t.slice(l,n.index),l>0,!0),n[0]),l=n.index+n[0].length,n=a.exec(t);return r.push(av(t.slice(l),l>0,!1)),r.join("")}function av(e,t,a){let n=0,l=e.length;if(t){let r=e.codePointAt(n);for(;r===9||r===32;)n++,r=e.codePointAt(n)}if(a){let r=e.codePointAt(l-1);for(;r===9||r===32;)l--,r=e.codePointAt(l-1)}return l>n?e.slice(n,l):""}function lv(e,t){let a={type:"text",value:nv(String(t.value))};return e.patch(t,a),e.applyData(t,a)}function rv(e,t){let a={type:"element",tagName:"hr",properties:{},children:[]};return e.patch(t,a),e.applyData(t,a)}var ov={blockquote:RL,break:OL,code:NL,delete:qL,emphasis:UL,footnoteReference:FL,heading:PL,html:HL,imageReference:_L,image:GL,inlineCode:VL,linkReference:jL,link:XL,listItem:QL,list:KL,paragraph:ZL,root:JL,strong:WL,table:$L,tableCell:tv,tableRow:ev,text:lv,thematicBreak:rv,toml:Lc,yaml:Lc,definition:Lc,footnoteDefinition:Lc};function Lc(){}var{defineProperty:VA}=Object,dv=typeof self=="object"?self:globalThis,iv=(e,t)=>{switch(e){case"Function":case"SharedWorker":case"Worker":case"eval":case"setInterval":case"setTimeout":throw new TypeError("unable to deserialize "+e)}return new dv[e](t)},jA=(e,t)=>{let a=(l,r)=>(e.set(r,l),l),n=l=>{if(e.has(l))return e.get(l);let[r,o]=t[l];switch(r){case 0:case-1:return a(o,l);case 1:{let i=a([],l);for(let u of o)i.push(n(u));return i}case 2:{let i=a({},l);for(let[u,c]of o){let s=n(u),f=n(c);s==="__proto__"?VA(i,s,{value:f,configurable:!0,enumerable:!0,writable:!0}):i[s]=f}return i}case 3:return a(new Date(o),l);case 4:{let{source:i,flags:u}=o;return a(new RegExp(i,u),l)}case 5:{let i=a(new Map,l);for(let[u,c]of o)i.set(n(u),n(c));return i}case 6:{let i=a(new Set,l);for(let u of o)i.add(n(u));return i}case 7:{let{name:i,message:u}=o;return a(typeof dv[i]=="function"?iv(i,u):new Error(u),l)}case 8:return a(BigInt(o),l);case"BigInt":return a(Object(BigInt(o)),l);case"ArrayBuffer":return a(new Uint8Array(o).buffer,o);case"DataView":{let{buffer:i}=new Uint8Array(o);return a(new DataView(i),o)}case"-0":return-0}return a(iv(r,o),l)};return n},km=e=>jA(new Map,e)(0);var nr="",{toString:XA}={},{keys:QA,is:YA}=Object,uu=e=>{let t=typeof e;if(t!=="object"||!e)return[0,t];let a=XA.call(e).slice(8,-1);switch(a){case"Array":return[1,nr];case"Object":return[2,nr];case"Date":return[3,nr];case"RegExp":return[4,nr];case"Map":return[5,nr];case"Set":return[6,nr];case"DataView":return[1,a]}return a.includes("Array")?[1,a]:e instanceof Error?[7,e.name||"Error"]:[2,a]},Cc=([e,t])=>e===0&&(t==="function"||t==="symbol"),KA=(e,t,a,n)=>{let l=(o,i)=>{let u=n.push(o)-1;return a.set(i,u),u},r=o=>{if(a.has(o))return a.get(o);let[i,u]=uu(o);switch(i){case 0:{let s=o;switch(u){case"bigint":i=8,s=o.toString();break;case"number":if(!o&&YA(o,-0))return n.push(["-0"])-1;break;case"function":case"symbol":if(e)throw new TypeError("unable to serialize "+u);s=null;break;case"undefined":return l([-1],o)}return l([i,s],o)}case 1:{if(u){let p=o;return u==="DataView"?p=new Uint8Array(o.buffer):u==="ArrayBuffer"&&(p=new Uint8Array(o)),l([u,[...p]],o)}let s=[],f=l([i,s],o);for(let p of o)s.push(r(p));return f}case 2:{if(u)switch(u){case"BigInt":return l([u,o.toString()],o);case"Boolean":case"Number":case"String":return l([u,o.valueOf()],o)}if(t&&"toJSON"in o)return r(o.toJSON());let s=[],f=l([i,s],o);for(let p of QA(o))(e||!Cc(uu(o[p])))&&s.push([r(p),r(o[p])]);return f}case 3:return l([i,isNaN(o.getTime())?nr:o.toISOString()],o);case 4:{let{source:s,flags:f}=o;return l([i,{source:s,flags:f}],o)}case 5:{let s=[],f=l([i,s],o);for(let[p,d]of o)(e||!(Cc(uu(p))||Cc(uu(d))))&&s.push([r(p),r(d)]);return f}case 6:{let s=[],f=l([i,s],o);for(let p of o)(e||!Cc(uu(p)))&&s.push(r(p));return f}}let{message:c}=o;return l([i,{name:u,message:c}],o)};return r},wm=(e,{json:t,lossy:a}={})=>{let n=[];return KA(!(t||a),!!t,new Map,n)(e),n};var po=typeof structuredClone=="function"?(e,t)=>t&&("json"in t||"lossy"in t)?km(wm(e,t)):structuredClone(e):(e,t)=>km(wm(e,t));function ZA(e,t){let a=[{type:"text",value:"\u21A9"}];return t>1&&a.push({type:"element",tagName:"sup",properties:{},children:[{type:"text",value:String(t)}]}),a}function JA(e,t){return"Back to reference "+(e+1)+(t>1?"-"+t:"")}function pv(e){let t=typeof e.options.clobberPrefix=="string"?e.options.clobberPrefix:"user-content-",a=e.options.footnoteBackContent||ZA,n=e.options.footnoteBackLabel||JA,l=e.options.footnoteLabel||"Footnotes",r=e.options.footnoteLabelTagName||"h2",o=e.options.footnoteLabelProperties||{className:["sr-only"]},i=[],u=-1;for(;++u<e.footnoteOrder.length;){let c=e.footnoteById.get(e.footnoteOrder[u]);if(!c)continue;let s=e.all(c),f=String(c.identifier).toUpperCase(),p=ga(f.toLowerCase()),d=0,h=[],y=e.footnoteCounts.get(f);for(;y!==void 0&&++d<=y;){h.length>0&&h.push({type:"text",value:" "});let m=typeof a=="string"?a:a(u,d);typeof m=="string"&&(m={type:"text",value:m}),h.push({type:"element",tagName:"a",properties:{href:"#"+t+"fnref-"+p+(d>1?"-"+d:""),dataFootnoteBackref:"",ariaLabel:typeof n=="string"?n:n(u,d),className:["data-footnote-backref"]},children:Array.isArray(m)?m:[m]})}let k=s[s.length-1];if(k&&k.type==="element"&&k.tagName==="p"){let m=k.children[k.children.length-1];m&&m.type==="text"?m.value+=" ":k.children.push({type:"text",value:" "}),k.children.push(...h)}else s.push(...h);let g={type:"element",tagName:"li",properties:{id:t+"fn-"+p},children:e.wrap(s,!0)};e.patch(c,g),i.push(g)}if(i.length!==0)return{type:"element",tagName:"section",properties:{dataFootnotes:!0,className:["footnotes"]},children:[{type:"element",tagName:r,properties:{...po(o),id:"footnote-label"},children:[{type:"text",value:l}]},{type:"text",value:`
`},{type:"element",tagName:"ol",properties:{},children:e.wrap(i,!0)},{type:"text",value:`
`}]}}var ml=(function(e){if(e==null)return tT;if(typeof e=="function")return Sc(e);if(typeof e=="object")return Array.isArray(e)?WA(e):$A(e);if(typeof e=="string")return eT(e);throw new Error("Expected function, string, or object as test")});function WA(e){let t=[],a=-1;for(;++a<e.length;)t[a]=ml(e[a]);return Sc(n);function n(...l){let r=-1;for(;++r<t.length;)if(t[r].apply(this,l))return!0;return!1}}function $A(e){let t=e;return Sc(a);function a(n){let l=n,r;for(r in e)if(l[r]!==t[r])return!1;return!0}}function eT(e){return Sc(t);function t(a){return a&&a.type===e}}function Sc(e){return t;function t(a,n,l){return!!(aT(a)&&e.call(this,a,typeof n=="number"?n:void 0,l||void 0))}}function tT(){return!0}function aT(e){return e!==null&&typeof e=="object"&&"type"in e}var mv=[],kc=!0,lr=!1,wc="skip";function su(e,t,a,n){let l;typeof t=="function"&&typeof a!="function"?(n=a,a=t):l=t;let r=ml(l),o=n?-1:1;i(e,void 0,[])();function i(u,c,s){let f=u&&typeof u=="object"?u:{};if(typeof f.type=="string"){let d=typeof f.tagName=="string"?f.tagName:typeof f.name=="string"?f.name:void 0;Object.defineProperty(p,"name",{value:"node ("+(u.type+(d?"<"+d+">":""))+")"})}return p;function p(){let d=mv,h,y,k;if((!t||r(u,c,s[s.length-1]||void 0))&&(d=nT(a(u,s)),d[0]===lr))return d;if("children"in u&&u.children){let g=u;if(g.children&&d[0]!==wc)for(y=(n?g.children.length:-1)+o,k=s.concat(g);y>-1&&y<g.children.length;){let m=g.children[y];if(h=i(m,y,k)(),h[0]===lr)return h;y=typeof h[1]=="number"?h[1]:y+o}}return d}}}function nT(e){return Array.isArray(e)?e:typeof e=="number"?[kc,e]:e==null?mv:[e]}function rr(e,t,a,n){let l,r,o;typeof t=="function"&&typeof a!="function"?(r=void 0,o=t,l=a):(r=t,o=a,l=n),su(e,r,i,l);function i(u,c){let s=c[c.length-1],f=s?s.children.indexOf(u):void 0;return o(u,f,s)}}var Im={}.hasOwnProperty,lT={};function gv(e,t){let a=t||lT,n=new Map,l=new Map,r=new Map,o={...ov,...a.handlers},i={all:c,applyData:oT,definitionById:n,footnoteById:l,footnoteCounts:r,footnoteOrder:[],handlers:o,one:u,options:a,patch:rT,wrap:uT};return rr(e,function(s){if(s.type==="definition"||s.type==="footnoteDefinition"){let f=s.type==="definition"?n:l,p=String(s.identifier).toUpperCase();f.has(p)||f.set(p,s)}}),i;function u(s,f){let p=s.type,d=i.handlers[p];if(Im.call(i.handlers,p)&&d)return d(i,s,f);if(i.options.passThrough&&i.options.passThrough.includes(p)){if("children"in s){let{children:y,...k}=s,g=po(k);return g.children=i.all(s),g}return po(s)}return(i.options.unknownHandler||iT)(i,s,f)}function c(s){let f=[];if("children"in s){let p=s.children,d=-1;for(;++d<p.length;){let h=i.one(p[d],s);if(h){if(d&&p[d-1].type==="break"&&(!Array.isArray(h)&&h.type==="text"&&(h.value=hv(h.value)),!Array.isArray(h)&&h.type==="element")){let y=h.children[0];y&&y.type==="text"&&(y.value=hv(y.value))}Array.isArray(h)?f.push(...h):f.push(h)}}}return f}}function rT(e,t){e.position&&(t.position=$p(e))}function oT(e,t){let a=t;if(e&&e.data){let n=e.data.hName,l=e.data.hChildren,r=e.data.hProperties;if(typeof n=="string")if(a.type==="element")a.tagName=n;else{let o="children"in a?a.children:[a];a={type:"element",tagName:n,properties:{},children:o}}a.type==="element"&&r&&Object.assign(a.properties,po(r)),"children"in a&&a.children&&l!==null&&l!==void 0&&(a.children=l)}return a}function iT(e,t){let a=t.data||{},n="value"in t&&!(Im.call(a,"hProperties")||Im.call(a,"hChildren"))?{type:"text",value:t.value}:{type:"element",tagName:"div",properties:{},children:e.all(t)};return e.patch(t,n),e.applyData(t,n)}function uT(e,t){let a=[],n=-1;for(t&&a.push({type:"text",value:`
`});++n<e.length;)n&&a.push({type:"text",value:`
`}),a.push(e[n]);return t&&e.length>0&&a.push({type:"text",value:`
`}),a}function hv(e){let t=0,a=e.charCodeAt(t);for(;a===9||a===32;)t++,a=e.charCodeAt(t);return e.slice(t)}function Ic(e,t){let a=gv(e,t),n=a.one(e,void 0),l=pv(a),r=Array.isArray(n)?{type:"root",children:n}:n||{type:"root",children:[]};return l&&("children"in r,r.children.push({type:"text",value:`
`},l)),r}function Ac(e,t){return e&&"run"in e?async function(a,n){let l=Ic(a,{file:n,...t});await e.run(l,n)}:function(a,n){return Ic(a,{file:n,...e||t})}}function Am(e){if(e)throw e}var Mc=W(wv(),1);function cu(e){if(typeof e!="object"||e===null)return!1;let t=Object.getPrototypeOf(e);return(t===null||t===Object.prototype||Object.getPrototypeOf(t)===null)&&!(Symbol.toStringTag in e)&&!(Symbol.iterator in e)}function Tm(){let e=[],t={run:a,use:n};return t;function a(...l){let r=-1,o=l.pop();if(typeof o!="function")throw new TypeError("Expected function as last argument, not "+o);i(null,...l);function i(u,...c){let s=e[++r],f=-1;if(u){o(u);return}for(;++f<l.length;)(c[f]===null||c[f]===void 0)&&(c[f]=l[f]);l=c,s?Iv(s,i)(...c):o(null,...c)}}function n(l){if(typeof l!="function")throw new TypeError("Expected `middelware` to be a function, not "+l);return e.push(l),t}}function Iv(e,t){let a;return n;function n(...o){let i=e.length>o.length,u;i&&o.push(l);try{u=e.apply(this,o)}catch(c){let s=c;if(i&&a)throw s;return l(s)}i||(u&&u.then&&typeof u.then=="function"?u.then(r,l):u instanceof Error?l(u):r(u))}function l(o,...i){a||(a=!0,t(o,...i))}function r(o){l(null,o)}}var ka={basename:sT,dirname:cT,extname:fT,join:dT,sep:"/"};function sT(e,t){if(t!==void 0&&typeof t!="string")throw new TypeError('"ext" argument must be a string');fu(e);let a=0,n=-1,l=e.length,r;if(t===void 0||t.length===0||t.length>e.length){for(;l--;)if(e.codePointAt(l)===47){if(r){a=l+1;break}}else n<0&&(r=!0,n=l+1);return n<0?"":e.slice(a,n)}if(t===e)return"";let o=-1,i=t.length-1;for(;l--;)if(e.codePointAt(l)===47){if(r){a=l+1;break}}else o<0&&(r=!0,o=l+1),i>-1&&(e.codePointAt(l)===t.codePointAt(i--)?i<0&&(n=l):(i=-1,n=o));return a===n?n=o:n<0&&(n=e.length),e.slice(a,n)}function cT(e){if(fu(e),e.length===0)return".";let t=-1,a=e.length,n;for(;--a;)if(e.codePointAt(a)===47){if(n){t=a;break}}else n||(n=!0);return t<0?e.codePointAt(0)===47?"/":".":t===1&&e.codePointAt(0)===47?"//":e.slice(0,t)}function fT(e){fu(e);let t=e.length,a=-1,n=0,l=-1,r=0,o;for(;t--;){let i=e.codePointAt(t);if(i===47){if(o){n=t+1;break}continue}a<0&&(o=!0,a=t+1),i===46?l<0?l=t:r!==1&&(r=1):l>-1&&(r=-1)}return l<0||a<0||r===0||r===1&&l===a-1&&l===n+1?"":e.slice(l,a)}function dT(...e){let t=-1,a;for(;++t<e.length;)fu(e[t]),e[t]&&(a=a===void 0?e[t]:a+"/"+e[t]);return a===void 0?".":pT(a)}function pT(e){fu(e);let t=e.codePointAt(0)===47,a=mT(e,!t);return a.length===0&&!t&&(a="."),a.length>0&&e.codePointAt(e.length-1)===47&&(a+="/"),t?"/"+a:a}function mT(e,t){let a="",n=0,l=-1,r=0,o=-1,i,u;for(;++o<=e.length;){if(o<e.length)i=e.codePointAt(o);else{if(i===47)break;i=47}if(i===47){if(!(l===o-1||r===1))if(l!==o-1&&r===2){if(a.length<2||n!==2||a.codePointAt(a.length-1)!==46||a.codePointAt(a.length-2)!==46){if(a.length>2){if(u=a.lastIndexOf("/"),u!==a.length-1){u<0?(a="",n=0):(a=a.slice(0,u),n=a.length-1-a.lastIndexOf("/")),l=o,r=0;continue}}else if(a.length>0){a="",n=0,l=o,r=0;continue}}t&&(a=a.length>0?a+"/..":"..",n=2)}else a.length>0?a+="/"+e.slice(l+1,o):a=e.slice(l+1,o),n=o-l-1;l=o,r=0}else i===46&&r>-1?r++:r=-1}return a}function fu(e){if(typeof e!="string")throw new TypeError("Path must be a string. Received "+JSON.stringify(e))}var Av={cwd:hT};function hT(){return"/"}function mo(e){return!!(e!==null&&typeof e=="object"&&"href"in e&&e.href&&"protocol"in e&&e.protocol&&e.auth===void 0)}function Tv(e){if(typeof e=="string")e=new URL(e);else if(!mo(e)){let t=new TypeError('The "path" argument must be of type string or an instance of URL. Received `'+e+"`");throw t.code="ERR_INVALID_ARG_TYPE",t}if(e.protocol!=="file:"){let t=new TypeError("The URL must be of scheme file");throw t.code="ERR_INVALID_URL_SCHEME",t}return gT(e)}function gT(e){if(e.hostname!==""){let n=new TypeError('File URL host must be "localhost" or empty on darwin');throw n.code="ERR_INVALID_FILE_URL_HOST",n}let t=e.pathname,a=-1;for(;++a<t.length;)if(t.codePointAt(a)===37&&t.codePointAt(a+1)===50){let n=t.codePointAt(a+2);if(n===70||n===102){let l=new TypeError("File URL path must not include encoded / characters");throw l.code="ERR_INVALID_FILE_URL_PATH",l}}return decodeURIComponent(t)}var Dm=["history","path","basename","stem","extname","dirname"],or=class{constructor(t){let a;t?mo(t)?a={path:t}:typeof t=="string"||xT(t)?a={value:t}:a=t:a={},this.cwd="cwd"in a?"":Av.cwd(),this.data={},this.history=[],this.messages=[],this.value,this.map,this.result,this.stored;let n=-1;for(;++n<Dm.length;){let r=Dm[n];r in a&&a[r]!==void 0&&a[r]!==null&&(this[r]=r==="history"?[...a[r]]:a[r])}let l;for(l in a)Dm.includes(l)||(this[l]=a[l])}get basename(){return typeof this.path=="string"?ka.basename(this.path):void 0}set basename(t){Em(t,"basename"),Mm(t,"basename"),this.path=ka.join(this.dirname||"",t)}get dirname(){return typeof this.path=="string"?ka.dirname(this.path):void 0}set dirname(t){Dv(this.basename,"dirname"),this.path=ka.join(t||"",this.basename)}get extname(){return typeof this.path=="string"?ka.extname(this.path):void 0}set extname(t){if(Mm(t,"extname"),Dv(this.dirname,"extname"),t){if(t.codePointAt(0)!==46)throw new Error("`extname` must start with `.`");if(t.includes(".",1))throw new Error("`extname` cannot contain multiple dots")}this.path=ka.join(this.dirname,this.stem+(t||""))}get path(){return this.history[this.history.length-1]}set path(t){mo(t)&&(t=Tv(t)),Em(t,"path"),this.path!==t&&this.history.push(t)}get stem(){return typeof this.path=="string"?ka.basename(this.path,this.extname):void 0}set stem(t){Em(t,"stem"),Mm(t,"stem"),this.path=ka.join(this.dirname||"",t+(this.extname||""))}fail(t,a,n){let l=this.message(t,a,n);throw l.fatal=!0,l}info(t,a,n){let l=this.message(t,a,n);return l.fatal=void 0,l}message(t,a,n){let l=new Xe(t,a,n);return this.path&&(l.name=this.path+":"+l.name,l.file=this.path),l.fatal=!1,this.messages.push(l),l}toString(t){return this.value===void 0?"":typeof this.value=="string"?this.value:new TextDecoder(t||void 0).decode(this.value)}};function Mm(e,t){if(e&&e.includes(ka.sep))throw new Error("`"+t+"` cannot be a path: did not expect `"+ka.sep+"`")}function Em(e,t){if(!e)throw new Error("`"+t+"` cannot be empty")}function Dv(e,t){if(!e)throw new Error("Setting `"+t+"` requires `path` to be set too")}function xT(e){return!!(e&&typeof e=="object"&&"byteLength"in e&&"byteOffset"in e)}var Mv=(function(e){let n=this.constructor.prototype,l=n[e],r=function(){return l.apply(r,arguments)};return Object.setPrototypeOf(r,n),r});var yT={}.hasOwnProperty,Om=class e extends Mv{constructor(){super("copy"),this.Compiler=void 0,this.Parser=void 0,this.attachers=[],this.compiler=void 0,this.freezeIndex=-1,this.frozen=void 0,this.namespace={},this.parser=void 0,this.transformers=Tm()}copy(){let t=new e,a=-1;for(;++a<this.attachers.length;){let n=this.attachers[a];t.use(...n)}return t.data((0,Mc.default)(!0,{},this.namespace)),t}data(t,a){return typeof t=="string"?arguments.length===2?(Rm("data",this.frozen),this.namespace[t]=a,this):yT.call(this.namespace,t)&&this.namespace[t]||void 0:t?(Rm("data",this.frozen),this.namespace=t,this):this.namespace}freeze(){if(this.frozen)return this;let t=this;for(;++this.freezeIndex<this.attachers.length;){let[a,...n]=this.attachers[this.freezeIndex];if(n[0]===!1)continue;n[0]===!0&&(n[0]=void 0);let l=a.call(t,...n);typeof l=="function"&&this.transformers.use(l)}return this.frozen=!0,this.freezeIndex=Number.POSITIVE_INFINITY,this}parse(t){this.freeze();let a=Dc(t),n=this.parser||this.Parser;return zm("parse",n),n(String(a),a)}process(t,a){let n=this;return this.freeze(),zm("process",this.parser||this.Parser),Bm("process",this.compiler||this.Compiler),a?l(void 0,a):new Promise(l);function l(r,o){let i=Dc(t),u=n.parse(i);n.run(u,i,function(s,f,p){if(s||!f||!p)return c(s);let d=f,h=n.stringify(d,p);LT(h)?p.value=h:p.result=h,c(s,p)});function c(s,f){s||!f?o(s):r?r(f):a(void 0,f)}}}processSync(t){let a=!1,n;return this.freeze(),zm("processSync",this.parser||this.Parser),Bm("processSync",this.compiler||this.Compiler),this.process(t,l),zv("processSync","process",a),n;function l(r,o){a=!0,Am(r),n=o}}run(t,a,n){Ev(t),this.freeze();let l=this.transformers;return!n&&typeof a=="function"&&(n=a,a=void 0),n?r(void 0,n):new Promise(r);function r(o,i){let u=Dc(a);l.run(t,u,c);function c(s,f,p){let d=f||t;s?i(s):o?o(d):n(void 0,d,p)}}}runSync(t,a){let n=!1,l;return this.run(t,a,r),zv("runSync","run",n),l;function r(o,i){Am(o),l=i,n=!0}}stringify(t,a){this.freeze();let n=Dc(a),l=this.compiler||this.Compiler;return Bm("stringify",l),Ev(t),l(t,n)}use(t,...a){let n=this.attachers,l=this.namespace;if(Rm("use",this.frozen),t!=null)if(typeof t=="function")u(t,a);else if(typeof t=="object")Array.isArray(t)?i(t):o(t);else throw new TypeError("Expected usable value, not `"+t+"`");return this;function r(c){if(typeof c=="function")u(c,[]);else if(typeof c=="object")if(Array.isArray(c)){let[s,...f]=c;u(s,f)}else o(c);else throw new TypeError("Expected usable value, not `"+c+"`")}function o(c){if(!("plugins"in c)&&!("settings"in c))throw new Error("Expected usable value but received an empty preset, which is probably a mistake: presets typically come with `plugins` and sometimes with `settings`, but this has neither");i(c.plugins),c.settings&&(l.settings=(0,Mc.default)(!0,l.settings,c.settings))}function i(c){let s=-1;if(c!=null)if(Array.isArray(c))for(;++s<c.length;){let f=c[s];r(f)}else throw new TypeError("Expected a list of plugins, not `"+c+"`")}function u(c,s){let f=-1,p=-1;for(;++f<n.length;)if(n[f][0]===c){p=f;break}if(p===-1)n.push([c,...s]);else if(s.length>0){let[d,...h]=s,y=n[p][1];cu(y)&&cu(d)&&(d=(0,Mc.default)(!0,y,d)),n[p]=[c,d,...h]}}}},Nm=new Om().freeze();function zm(e,t){if(typeof t!="function")throw new TypeError("Cannot `"+e+"` without `parser`")}function Bm(e,t){if(typeof t!="function")throw new TypeError("Cannot `"+e+"` without `compiler`")}function Rm(e,t){if(t)throw new Error("Cannot call `"+e+"` on a frozen processor.\nCreate a new processor first, by calling it: use `processor()` instead of `processor`.")}function Ev(e){if(!cu(e)||typeof e.type!="string")throw new TypeError("Expected node, got `"+e+"`")}function zv(e,t,a){if(!a)throw new Error("`"+e+"` finished async. Use `"+t+"` instead")}function Dc(e){return bT(e)?e:new or(e)}function bT(e){return!!(e&&typeof e=="object"&&"message"in e&&"messages"in e)}function LT(e){return typeof e=="string"||vT(e)}function vT(e){return!!(e&&typeof e=="object"&&"byteLength"in e&&"byteOffset"in e)}var CT="https://github.com/remarkjs/react-markdown/blob/main/changelog.md",Bv=[],Rv={allowDangerousHtml:!0},ST=/^(https?|ircs?|mailto|xmpp)$/i,kT=[{from:"astPlugins",id:"remove-buggy-html-in-markdown-parser"},{from:"allowDangerousHtml",id:"remove-buggy-html-in-markdown-parser"},{from:"allowNode",id:"replace-allownode-allowedtypes-and-disallowedtypes",to:"allowElement"},{from:"allowedTypes",id:"replace-allownode-allowedtypes-and-disallowedtypes",to:"allowedElements"},{from:"className",id:"remove-classname"},{from:"disallowedTypes",id:"replace-allownode-allowedtypes-and-disallowedtypes",to:"disallowedElements"},{from:"escapeHtml",id:"remove-buggy-html-in-markdown-parser"},{from:"includeElementIndex",id:"#remove-includeelementindex"},{from:"includeNodeIndex",id:"change-includenodeindex-to-includeelementindex"},{from:"linkTarget",id:"remove-linktarget"},{from:"plugins",id:"change-plugins-to-remarkplugins",to:"remarkPlugins"},{from:"rawSourcePos",id:"#remove-rawsourcepos"},{from:"renderers",id:"change-renderers-to-components",to:"components"},{from:"source",id:"change-source-to-children",to:"children"},{from:"sourcePos",id:"#remove-sourcepos"},{from:"transformImageUri",id:"#add-urltransform",to:"urlTransform"},{from:"transformLinkUri",id:"#add-urltransform",to:"urlTransform"}];function du(e){let t=wT(e),a=IT(e);return AT(t.runSync(t.parse(a),a),e)}function wT(e){let t=e.rehypePlugins||Bv,a=e.remarkPlugins||Bv,n=e.remarkRehypeOptions?{...e.remarkRehypeOptions,...Rv}:Rv;return Nm().use(yc).use(a).use(Ac,n).use(t)}function IT(e){let t=e.children||"",a=new or;return typeof t=="string"?a.value=t:(""+t,void 0),a}function AT(e,t){let a=t.allowedElements,n=t.allowElement,l=t.components,r=t.disallowedElements,o=t.skipHtml,i=t.unwrapDisallowed,u=t.urlTransform||Nv;for(let s of kT)Object.hasOwn(t,s.from)&&(""+s.from+(s.to?"use `"+s.to+"` instead":"remove it")+CT+s.id,void 0);return a&&r&&void 0,rr(e,c),am(e,{Fragment:ho.Fragment,components:l,ignoreInvalidStyle:!0,jsx:ho.jsx,jsxs:ho.jsxs,passKeys:!0,passNode:!0});function c(s,f,p){if(s.type==="raw"&&p&&typeof f=="number")return o?p.children.splice(f,1):p.children[f]={type:"text",value:s.value},f;if(s.type==="element"){let d;for(d in tu)if(Object.hasOwn(tu,d)&&Object.hasOwn(s.properties,d)){let h=s.properties[d],y=tu[d];(y===null||y.includes(s.tagName))&&(s.properties[d]=u(String(h||""),d,s))}}if(s.type==="element"){let d=a?!a.includes(s.tagName):r?r.includes(s.tagName):!1;if(!d&&n&&typeof f=="number"&&(d=!n(s,f,p)),d&&p&&typeof f=="number")return i&&s.children?p.children.splice(f,1,...s.children):p.children.splice(f,1),f}}}function Nv(e){let t=e.indexOf(":"),a=e.indexOf("?"),n=e.indexOf("#"),l=e.indexOf("/");return t===-1||l!==-1&&t>l||a!==-1&&t>a||n!==-1&&t>n||ST.test(e.slice(0,t))?e:""}function qm(e,t){let a=String(e);if(typeof t!="string")throw new TypeError("Expected character");let n=0,l=a.indexOf(t);for(;l!==-1;)n++,l=a.indexOf(t,l+t.length);return n}function Um(e){if(typeof e!="string")throw new TypeError("Expected a string");return e.replace(/[|\\{}()[\]^$+*?.]/g,"\\$&").replace(/-/g,"\\x2d")}function Fm(e,t,a){let l=ml((a||{}).ignore||[]),r=TT(t),o=-1;for(;++o<r.length;)su(e,"text",i);function i(c,s){let f=-1,p;for(;++f<s.length;){let d=s[f],h=p?p.children:void 0;if(l(d,h?h.indexOf(d):void 0,p))return;p=d}if(p)return u(c,s)}function u(c,s){let f=s[s.length-1],p=r[o][0],d=r[o][1],h=0,k=f.children.indexOf(c),g=!1,m=[];p.lastIndex=0;let x=p.exec(c.value);for(;x;){let S=x.index,I={index:x.index,input:x.input,stack:[...s,c]},v=d(...x,I);if(typeof v=="string"&&(v=v.length>0?{type:"text",value:v}:void 0),v===!1?p.lastIndex=S+1:(h!==S&&m.push({type:"text",value:c.value.slice(h,S)}),Array.isArray(v)?m.push(...v):v&&m.push(v),h=S+x[0].length,g=!0),!p.global)break;x=p.exec(c.value)}return g?(h<c.value.length&&m.push({type:"text",value:c.value.slice(h)}),f.children.splice(k,1,...m)):m=[c],k+m.length}}function TT(e){let t=[];if(!Array.isArray(e))throw new TypeError("Expected find and replace tuple or list of tuples");let a=!e[0]||Array.isArray(e[0])?e:[e],n=-1;for(;++n<a.length;){let l=a[n];t.push([DT(l[0]),MT(l[1])])}return t}function DT(e){return typeof e=="string"?new RegExp(Um(e),"g"):e}function MT(e){return typeof e=="function"?e:function(){return e}}var Pm="phrasing",Hm=["autolink","link","image","label"];function Gm(){return{transforms:[NT],enter:{literalAutolink:ET,literalAutolinkEmail:_m,literalAutolinkHttp:_m,literalAutolinkWww:_m},exit:{literalAutolink:OT,literalAutolinkEmail:RT,literalAutolinkHttp:zT,literalAutolinkWww:BT}}}function Vm(){return{unsafe:[{character:"@",before:"[+\\-.\\w]",after:"[\\-.\\w]",inConstruct:Pm,notInConstruct:Hm},{character:".",before:"[Ww]",after:"[\\-.\\w]",inConstruct:Pm,notInConstruct:Hm},{character:":",before:"[ps]",after:"\\/",inConstruct:Pm,notInConstruct:Hm}]}}function ET(e){this.enter({type:"link",title:null,url:"",children:[]},e)}function _m(e){this.config.enter.autolinkProtocol.call(this,e)}function zT(e){this.config.exit.autolinkProtocol.call(this,e)}function BT(e){this.config.exit.data.call(this,e);let t=this.stack[this.stack.length-1];t.type,t.url="http://"+this.sliceSerialize(e)}function RT(e){this.config.exit.autolinkEmail.call(this,e)}function OT(e){this.exit(e)}function NT(e){Fm(e,[[/(https?:\/\/|www(?=\.))([-.\w]+)([^ \t\r\n]*)/gi,qT],[/(?<=^|\s|\p{P}|\p{S})([-.\w+]+)@([-\w]+(?:\.[-\w]+)+)/gu,UT]],{ignore:["link","linkReference"]})}function qT(e,t,a,n,l){let r="";if(!qv(l)||(/^w/i.test(t)&&(a=t+a,t="",r="http://"),!FT(a)))return!1;let o=PT(a+n);if(!o[0])return!1;let i={type:"link",title:null,url:r+t+o[0],children:[{type:"text",value:t+o[0]}]};return o[1]?[i,{type:"text",value:o[1]}]:i}function UT(e,t,a,n){return!qv(n,!0)||/[-\d_]$/.test(a)?!1:{type:"link",title:null,url:"mailto:"+t+"@"+a,children:[{type:"text",value:t+"@"+a}]}}function FT(e){let t=e.split(".");return!(t.length<2||t[t.length-1]&&(/_/.test(t[t.length-1])||!/[a-zA-Z\d]/.test(t[t.length-1]))||t[t.length-2]&&(/_/.test(t[t.length-2])||!/[a-zA-Z\d]/.test(t[t.length-2])))}function PT(e){let t=/[!"&'),.:;<>?\]}]+$/.exec(e);if(!t)return[e,void 0];e=e.slice(0,t.index);let a=t[0],n=a.indexOf(")"),l=qm(e,"("),r=qm(e,")");for(;n!==-1&&l>r;)e+=a.slice(0,n+1),a=a.slice(n+1),n=a.indexOf(")"),r++;return[e,a]}function qv(e,t){let a=e.input.charCodeAt(e.index-1);return(e.index===0||Ha(a)||$l(a))&&(!t||a!==47)}Uv.peek=KT;function HT(){this.buffer()}function _T(e){this.enter({type:"footnoteReference",identifier:"",label:""},e)}function GT(){this.buffer()}function VT(e){this.enter({type:"footnoteDefinition",identifier:"",label:"",children:[]},e)}function jT(e){let t=this.resume(),a=this.stack[this.stack.length-1];a.type,a.identifier=Lt(this.sliceSerialize(e)).toLowerCase(),a.label=t}function XT(e){this.exit(e)}function QT(e){let t=this.resume(),a=this.stack[this.stack.length-1];a.type,a.identifier=Lt(this.sliceSerialize(e)).toLowerCase(),a.label=t}function YT(e){this.exit(e)}function KT(){return"["}function Uv(e,t,a,n){let l=a.createTracker(n),r=l.move("[^"),o=a.enter("footnoteReference"),i=a.enter("reference");return r+=l.move(a.safe(a.associationId(e),{after:"]",before:r})),i(),o(),r+=l.move("]"),r}function jm(){return{enter:{gfmFootnoteCallString:HT,gfmFootnoteCall:_T,gfmFootnoteDefinitionLabelString:GT,gfmFootnoteDefinition:VT},exit:{gfmFootnoteCallString:jT,gfmFootnoteCall:XT,gfmFootnoteDefinitionLabelString:QT,gfmFootnoteDefinition:YT}}}function Xm(e){let t=!1;return e&&e.firstLineBlank&&(t=!0),{handlers:{footnoteDefinition:a,footnoteReference:Uv},unsafe:[{character:"[",inConstruct:["label","phrasing","reference"]}]};function a(n,l,r,o){let i=r.createTracker(o),u=i.move("[^"),c=r.enter("footnoteDefinition"),s=r.enter("label");return u+=i.move(r.safe(r.associationId(n),{before:u,after:"]"})),s(),u+=i.move("]:"),n.children&&n.children.length>0&&(i.shift(4),u+=i.move((t?`
`:" ")+r.indentLines(r.containerFlow(n,i.current()),t?Fv:ZT))),c(),u}}function ZT(e,t,a){return t===0?e:Fv(e,t,a)}function Fv(e,t,a){return(a?"":"    ")+e}var JT=["autolink","destinationLiteral","destinationRaw","reference","titleQuote","titleApostrophe"];Km.attention=eD;Km.peek=tD;function Qm(){return{canContainEols:["delete"],enter:{strikethrough:WT},exit:{strikethrough:$T}}}function Ym(){return{handlers:{delete:Km},unsafe:[{character:"~",inConstruct:"phrasing",notInConstruct:JT}]}}function WT(e){this.enter({type:"delete",children:[],position:void 0},e)}function $T(e){this.exit(e)}function Km(e,t,a,n){let l=a.createTracker(n),r=a.stack.includes("strikethrough")?"~":"~~",o=a.enter("strikethrough"),i=l.move(r);return i+=a.containerPhrasing(e,{...l.current(),before:i,after:"~"}),i+=l.move(r),o(),i}function eD(){return{construct:"strikethrough",markers:["~"],sizes:[2,1]}}function tD(){return"~"}function aD(e){return e.length}function Hv(e,t){let a=t||{},n=(a.align||[]).concat(),l=a.stringLength||aD,r=[],o=[],i=[],u=[],c=0,s=-1;for(;++s<e.length;){let y=[],k=[],g=-1;for(e[s].length>c&&(c=e[s].length);++g<e[s].length;){let m=nD(e[s][g]);if(a.alignDelimiters!==!1){let x=l(m);k[g]=x,(u[g]===void 0||x>u[g])&&(u[g]=x)}y.push(m)}o[s]=y,i[s]=k}let f=-1;if(typeof n=="object"&&"length"in n)for(;++f<c;)r[f]=Pv(n[f]);else{let y=Pv(n);for(;++f<c;)r[f]=y}f=-1;let p=[],d=[];for(;++f<c;){let y=r[f],k="",g="";y===99?(k=":",g=":"):y===108?k=":":y===114&&(g=":");let m=a.alignDelimiters===!1?1:Math.max(1,u[f]-k.length-g.length),x=k+"-".repeat(m)+g;a.alignDelimiters!==!1&&(m=k.length+m+g.length,m>u[f]&&(u[f]=m),d[f]=m),p[f]=x}o.splice(1,0,p),i.splice(1,0,d),s=-1;let h=[];for(;++s<o.length;){let y=o[s],k=i[s];f=-1;let g=[];for(;++f<c;){let m=y[f]||"",x="",S="";if(a.alignDelimiters!==!1){let I=u[f]-(k[f]||0),v=r[f];v===114?x=" ".repeat(I):v===99?I%2?(x=" ".repeat(I/2+.5),S=" ".repeat(I/2-.5)):(x=" ".repeat(I/2),S=x):S=" ".repeat(I)}a.delimiterStart!==!1&&!f&&g.push("|"),a.padding!==!1&&!(a.alignDelimiters===!1&&m==="")&&(a.delimiterStart!==!1||f)&&g.push(" "),a.alignDelimiters!==!1&&g.push(x),g.push(m),a.alignDelimiters!==!1&&g.push(S),a.padding!==!1&&g.push(" "),(a.delimiterEnd!==!1||f!==c-1)&&g.push("|")}h.push(a.delimiterEnd===!1?g.join("").replace(/ +$/,""):g.join(""))}return h.join(`
`)}function nD(e){return e==null?"":String(e)}function Pv(e){let t=typeof e=="string"?e.codePointAt(0):0;return t===67||t===99?99:t===76||t===108?108:t===82||t===114?114:0}var Zm=ml(["break","delete","emphasis","footnote","footnoteReference","image","imageReference","inlineCode","inlineMath","link","linkReference","mdxJsxTextElement","mdxTextExpression","strong","text","textDirective"]);function _v(e,t,a,n){let l=a.enter("blockquote"),r=a.createTracker(n);r.move("> "),r.shift(2);let o=a.indentLines(a.containerFlow(e,r.current()),lD);return l(),o}function lD(e,t,a){return">"+(a?"":" ")+e}function Vv(e,t){return Gv(e,t.inConstruct,!0)&&!Gv(e,t.notInConstruct,!1)}function Gv(e,t,a){if(typeof t=="string"&&(t=[t]),!t||t.length===0)return a;let n=-1;for(;++n<t.length;)if(e.includes(t[n]))return!0;return!1}function Jm(e,t,a,n){let l=-1;for(;++l<a.unsafe.length;){let r=a.unsafe[l];if(r.character===`
`&&!r.before&&!r.after&&Vv(a.stack,r))return/[\t ]/.test(n.before)?"":" "}return`\\
`}function jv(e,t){let a=String(e),n=a.indexOf(t),l=n,r=0,o=0;if(typeof t!="string")throw new TypeError("Expected substring");for(;n!==-1;)n===l?++r>o&&(o=r):r=1,l=n+t.length,n=a.indexOf(t,l);return o}function Xv(e,t){return!!(t.options.fences===!1&&e.value&&!e.lang&&/[^\n\r ]/.test(e.value)&&!/^[\t ]*(?:[\n\r]|$)|(?:^|[\n\r])[\t ]*$/.test(e.value))}function Qv(e){let t=e.options.fence||"`";if(t!=="`"&&t!=="~")throw new Error("Cannot serialize code with `"+t+"` for `options.fence`, expected `` ` `` or `~`");return t}function Yv(e,t,a,n){let l=Qv(a),r=e.value||"";if(Xv(e,a)){let f=a.enter("codeIndented"),p=a.indentLines(r,rD);return f(),p}let o=a.createTracker(n),i=l.repeat(Math.max(jv(r,l)+1,3)),u=a.enter("codeFenced"),c=l==="`"?"GraveAccent":"Tilde",s=o.move(i);if(e.lang){let f=a.enter(`codeFencedLang${c}`);s+=o.move(a.safe(e.lang,{before:s,after:" ",encode:["`"],...o.current()})),f()}if(e.lang&&e.meta){let f=a.enter(`codeFencedMeta${c}`);s+=o.move(" "),s+=o.move(a.safe(e.meta,{before:s,after:`
`,encode:["`"],...o.current()})),f()}return s+=o.move(`
`),r&&(s+=o.move(r+`
`)),s+=o.move(i),u(),s}function rD(e,t,a){return(a?"":"    ")+e}function go(e){let t=e.options.quote||'"';if(t!=='"'&&t!=="'")throw new Error("Cannot serialize title with `"+t+"` for `options.quote`, expected `\"`, or `'`");return t}function Kv(e,t,a,n){let l=go(a),r=l==='"'?"Quote":"Apostrophe",o=a.enter("definition"),i=a.enter("label"),u=a.createTracker(n),c=u.move("[");return c+=u.move(a.safe(a.associationId(e),{before:c,after:"]",...u.current()})),c+=u.move("]: "),i(),!e.url||/[\0- \u007F]/.test(e.url)?(i=a.enter("destinationLiteral"),c+=u.move("<"),c+=u.move(a.safe(e.url,{before:c,after:">",...u.current()})),c+=u.move(">")):(i=a.enter("destinationRaw"),c+=u.move(a.safe(e.url,{before:c,after:e.title?" ":`
`,...u.current()}))),i(),e.title&&(i=a.enter(`title${r}`),c+=u.move(" "+l),c+=u.move(a.safe(e.title,{before:c,after:l,...u.current()})),c+=u.move(l),i()),o(),c}function Zv(e){let t=e.options.emphasis||"*";if(t!=="*"&&t!=="_")throw new Error("Cannot serialize emphasis with `"+t+"` for `options.emphasis`, expected `*`, or `_`");return t}Ec.attention=oD;Ec.peek=iD;function Ec(e,t,a,n){let l=a.enter("phrasing"),r=a.containerPhrasing({type:"root",children:[e]},n);return l(),r}function oD(e,t){return{construct:"emphasis",markers:Zv(t)==="*"?["*","_"]:["_","*"],sizes:[1]}}function iD(e,t,a){return a.options.emphasis||"*"}function Jv(e){return"&#x"+e.toString(16).toUpperCase()+";"}function Wv(e,t){let a=!1;return rr(e,function(n){if("value"in n&&/\r?\n|\r/.test(n.value)||n.type==="break")return a=!0,lr}),!!((!e.depth||e.depth<3)&&Jl(e)&&(t.options.setext||a))}function $v(e,t,a,n){let l=Math.max(Math.min(6,e.depth||1),1),r=a.createTracker(n);if(Wv(e,a)){let f=a.enter("headingSetext"),p=a.enter("phrasing"),d=a.containerPhrasing(e,{...r.current(),before:`
`,after:`
`});return p(),f(),d+`
`+(l===1?"=":"-").repeat(d.length-(Math.max(d.lastIndexOf("\r"),d.lastIndexOf(`
`))+1))}let o="#".repeat(l),i=a.enter("headingAtx"),u=a.enter("phrasing");r.move(o+" ");let c=a.containerPhrasing(e,{before:"# ",after:`
`,...r.current()}),s=c.charCodeAt(0);return(s===9||s===32)&&(c=Jv(s)+c.slice(1)),c=c?o+" "+c:o,a.options.closeAtx&&(c+=" "+o),u(),i(),c}Wm.peek=uD;function Wm(e){return e.value||""}function uD(){return"<"}$m.peek=sD;function $m(e,t,a,n){let l=go(a),r=l==='"'?"Quote":"Apostrophe",o=a.enter("image"),i=a.enter("label"),u=a.createTracker(n),c=u.move("![");return c+=u.move(a.safe(e.alt,{before:c,after:"]",...u.current()})),c+=u.move("]("),i(),!e.url&&e.title||/[\0- \u007F]/.test(e.url)?(i=a.enter("destinationLiteral"),c+=u.move("<"),c+=u.move(a.safe(e.url,{before:c,after:">",...u.current()})),c+=u.move(">")):(i=a.enter("destinationRaw"),c+=u.move(a.safe(e.url,{before:c,after:e.title?" ":")",...u.current()}))),i(),e.title&&(i=a.enter(`title${r}`),c+=u.move(" "+l),c+=u.move(a.safe(e.title,{before:c,after:l,...u.current()})),c+=u.move(l),i()),c+=u.move(")"),o(),c}function sD(){return"!"}eh.peek=cD;function eh(e,t,a,n){let l=e.referenceType,r=a.enter("imageReference"),o=a.enter("label"),i=a.createTracker(n),u=i.move("!["),c=a.safe(e.alt,{before:u,after:"]",...i.current()});u+=i.move(c+"]["),o();let s=a.stack;a.stack=s.filter(function(p){return p!=="phrasing"}),o=a.enter("reference");let f=a.safe(a.associationId(e),{before:u,after:"]",...i.current()});return o(),a.stack=s,r(),l==="full"||!c||c!==f?u+=i.move(f+"]"):l==="shortcut"?u=u.slice(0,-1):u+=i.move("]"),u}function cD(){return"!"}th.peek=fD;function th(e,t,a){let n=e.value||"",l="`",r=-1;for(;new RegExp("(^|[^`])"+l+"([^`]|$)").test(n);)l+="`";for(/[^\n\r ]/.test(n)&&(/^[\n\r ]/.test(n)&&/[\n\r ]$/.test(n)||/^`|`$/.test(n))&&(n=" "+n+" ");++r<a.unsafe.length;){let o=a.unsafe[r],i=a.compilePattern(o);if(!o.atBreak)continue;let u;for(;u=i.exec(n);){let c=u.index;n.charCodeAt(c)===10&&n.charCodeAt(c-1)===13&&c--,n=n.slice(0,c)+" "+n.slice(u.index+1)}}return l+n+l}function fD(){return"`"}function ah(e,t){let a=Jl(e);return!!(!t.options.resourceLink&&e.url&&!e.title&&e.children&&e.children.length===1&&e.children[0].type==="text"&&(a===e.url||"mailto:"+a===e.url)&&/^[a-z][+\-.a-z]+:/i.test(e.url)&&!/[\0- <>\u007F]/.test(e.url))}nh.peek=dD;function nh(e,t,a,n){let l=go(a),r=l==='"'?"Quote":"Apostrophe",o=a.createTracker(n);if(ah(e,a)){let s=a.stack;a.stack=s.filter(function(d){return d!=="phrasing"});let f=a.enter("autolink"),p=o.move("<");return p+=o.move(a.containerPhrasing(e,{before:p,after:">",...o.current()})),p+=o.move(">"),f(),a.stack=s,p}let i=a.enter("link"),u=a.enter("label"),c=o.move("[");return c+=o.move(a.containerPhrasing(e,{before:c,after:"](",...o.current()})),c+=o.move("]("),u(),!e.url&&e.title||/[\0- \u007F]/.test(e.url)?(u=a.enter("destinationLiteral"),c+=o.move("<"),c+=o.move(a.safe(e.url,{before:c,after:">",...o.current()})),c+=o.move(">")):(u=a.enter("destinationRaw"),c+=o.move(a.safe(e.url,{before:c,after:e.title?" ":")",...o.current()}))),u(),e.title&&(u=a.enter(`title${r}`),c+=o.move(" "+l),c+=o.move(a.safe(e.title,{before:c,after:l,...o.current()})),c+=o.move(l),u()),c+=o.move(")"),i(),c}function dD(e,t,a){return ah(e,a)?"<":"["}lh.peek=pD;function lh(e,t,a,n){let l=e.referenceType,r=a.enter("linkReference"),o=a.enter("label"),i=a.createTracker(n),u=i.move("["),c=a.containerPhrasing(e,{before:u,after:"]",...i.current()});u+=i.move(c+"]["),o();let s=a.stack;a.stack=s.filter(function(p){return p!=="phrasing"}),o=a.enter("reference");let f=a.safe(a.associationId(e),{before:u,after:"]",...i.current()});return o(),a.stack=s,r(),l==="full"||!c||c!==f?u+=i.move(f+"]"):l==="shortcut"?u=u.slice(0,-1):u+=i.move("]"),u}function pD(){return"["}function xo(e){let t=e.options.bullet||"*";if(t!=="*"&&t!=="+"&&t!=="-")throw new Error("Cannot serialize items with `"+t+"` for `options.bullet`, expected `*`, `+`, or `-`");return t}function e0(e){let t=xo(e),a=e.options.bulletOther;if(!a)return t==="*"?"-":"*";if(a!=="*"&&a!=="+"&&a!=="-")throw new Error("Cannot serialize items with `"+a+"` for `options.bulletOther`, expected `*`, `+`, or `-`");if(a===t)throw new Error("Expected `bullet` (`"+t+"`) and `bulletOther` (`"+a+"`) to be different");return a}function t0(e){let t=e.options.bulletOrdered||".";if(t!=="."&&t!==")")throw new Error("Cannot serialize items with `"+t+"` for `options.bulletOrdered`, expected `.` or `)`");return t}function zc(e){let t=e.options.rule||"*";if(t!=="*"&&t!=="-"&&t!=="_")throw new Error("Cannot serialize rules with `"+t+"` for `options.rule`, expected `*`, `-`, or `_`");return t}function a0(e,t,a,n){let l=a.enter("list"),r=a.bulletCurrent,o=e.ordered?t0(a):xo(a),i=e.ordered?o==="."?")":".":e0(a),u=t&&a.bulletLastUsed?o===a.bulletLastUsed:!1;if(!e.ordered){let s=e.children?e.children[0]:void 0;if((o==="*"||o==="-")&&s&&(!s.children||!s.children[0])&&a.stack[a.stack.length-1]==="list"&&a.stack[a.stack.length-2]==="listItem"&&a.stack[a.stack.length-3]==="list"&&a.stack[a.stack.length-4]==="listItem"&&a.indexStack[a.indexStack.length-1]===0&&a.indexStack[a.indexStack.length-2]===0&&a.indexStack[a.indexStack.length-3]===0&&(u=!0),zc(a)===o&&s){let f=-1;for(;++f<e.children.length;){let p=e.children[f];if(p&&p.type==="listItem"&&p.children&&p.children[0]&&p.children[0].type==="thematicBreak"){u=!0;break}}}}u&&(o=i),a.bulletCurrent=o;let c=a.containerFlow(e,n);return a.bulletLastUsed=o,a.bulletCurrent=r,l(),c}function n0(e){let t=e.options.listItemIndent||"one";if(t!=="tab"&&t!=="one"&&t!=="mixed")throw new Error("Cannot serialize items with `"+t+"` for `options.listItemIndent`, expected `tab`, `one`, or `mixed`");return t}function l0(e,t,a,n){let l=n0(a),r=a.bulletCurrent||xo(a);t&&t.type==="list"&&t.ordered&&(r=(typeof t.start=="number"&&t.start>-1?t.start:1)+(a.options.incrementListMarker===!1?0:t.children.indexOf(e))+r);let o=r.length+1;(l==="tab"||l==="mixed"&&(t&&t.type==="list"&&t.spread||e.spread))&&(o=Math.ceil(o/4)*4);let i=a.createTracker(n);i.move(r+" ".repeat(o-r.length)),i.shift(o);let u=a.enter("listItem"),c=a.indentLines(a.containerFlow(e,i.current()),s);return u(),c;function s(f,p,d){return p?(d?"":" ".repeat(o))+f:(d?r:r+" ".repeat(o-r.length))+f}}function r0(e,t,a,n){let l=a.enter("paragraph"),r=a.enter("phrasing"),o=a.containerPhrasing(e,n);return r(),l(),o}function o0(e,t,a,n){if(!e.children.some(function(i){return Zm(i)}))return a.containerFlow(e,n);let r=a.enter("phrasing"),o=a.containerPhrasing(e,n);return r(),o}function i0(e){let t=e.options.strong||"*";if(t!=="*"&&t!=="_")throw new Error("Cannot serialize strong with `"+t+"` for `options.strong`, expected `*`, or `_`");return t}Bc.attention=mD;Bc.peek=hD;function Bc(e,t,a,n){let l=a.enter("phrasing"),r=a.containerPhrasing({type:"root",children:[e]},n);return l(),r}function mD(e,t){return{construct:"strong",markers:i0(t)==="*"?["*","_"]:["_","*"],sizes:[2]}}function hD(e,t,a){return a.options.strong||"*"}function u0(e,t,a,n){return a.safe(e.value,n)}function s0(e){let t=e.options.ruleRepetition||3;if(t<3)throw new Error("Cannot serialize rules with repetition `"+t+"` for `options.ruleRepetition`, expected `3` or more");return t}function c0(e,t,a){let n=(zc(a)+(a.options.ruleSpaces?" ":"")).repeat(s0(a));return a.options.ruleSpaces?n.slice(0,-1):n}var pu={blockquote:_v,break:Jm,code:Yv,definition:Kv,emphasis:Ec,hardBreak:Jm,heading:$v,html:Wm,image:$m,imageReference:eh,inlineCode:th,link:nh,linkReference:lh,list:a0,listItem:l0,paragraph:r0,root:o0,strong:Bc,text:u0,thematicBreak:c0};function oh(){return{enter:{table:gD,tableData:f0,tableHeader:f0,tableRow:yD},exit:{codeText:bD,table:xD,tableData:rh,tableHeader:rh,tableRow:rh}}}function gD(e){let t=e._align;this.enter({type:"table",align:t.map(function(a){return a==="none"?null:a}),children:[]},e),this.data.inTable=!0}function xD(e){this.exit(e),this.data.inTable=void 0}function yD(e){this.enter({type:"tableRow",children:[]},e)}function rh(e){this.exit(e)}function f0(e){this.enter({type:"tableCell",children:[]},e)}function bD(e){let t=this.resume();this.data.inTable&&(t=t.replace(/\\([\\|])/g,LD));let a=this.stack[this.stack.length-1];a.type,a.value=t,this.exit(e)}function LD(e,t){return t==="|"?t:e}function ih(e){let t=e||{},a=t.tableCellPadding,n=t.tablePipeAlign,l=t.stringLength,r=a?" ":"|";return{unsafe:[{character:"\r",inConstruct:"tableCell"},{character:`
`,inConstruct:"tableCell"},{atBreak:!0,character:"|",after:"[	 :-]"},{character:"|",inConstruct:"tableCell"},{atBreak:!0,character:":",after:"-"},{atBreak:!0,character:"-",after:"[:|-]"}],handlers:{inlineCode:p,table:o,tableCell:u,tableRow:i}};function o(d,h,y,k){return c(s(d,y,k),d.align)}function i(d,h,y,k){let g=f(d,y,k),m=c([g]);return m.slice(0,m.indexOf(`
`))}function u(d,h,y,k){let g=y.enter("tableCell"),m=y.enter("phrasing"),x=y.containerPhrasing(d,{...k,before:r,after:r});return m(),g(),x}function c(d,h){return Hv(d,{align:h,alignDelimiters:n,padding:a,stringLength:l})}function s(d,h,y){let k=d.children,g=-1,m=[],x=h.enter("table");for(;++g<k.length;)m[g]=f(k[g],h,y);return x(),m}function f(d,h,y){let k=d.children,g=-1,m=[],x=h.enter("tableRow");for(;++g<k.length;)m[g]=u(k[g],d,h,y);return x(),m}function p(d,h,y){let k=pu.inlineCode(d,h,y);return y.stack.includes("tableCell")&&(k=k.replace(/\|/g,"\\$&")),k}}function uh(){return{exit:{taskListCheckValueChecked:d0,taskListCheckValueUnchecked:d0,paragraph:vD}}}function sh(){return{unsafe:[{atBreak:!0,character:"-",after:"[:|-]"}],handlers:{listItem:CD}}}function d0(e){let t=this.stack[this.stack.length-2];t.type,t.checked=e.type==="taskListCheckValueChecked"}function vD(e){let t=this.stack[this.stack.length-2];if(t&&t.type==="listItem"&&typeof t.checked=="boolean"){let a=this.stack[this.stack.length-1];a.type;let n=a.children[0];if(n&&n.type==="text"){let l=t.children,r=-1,o;for(;++r<l.length;){let i=l[r];if(i.type==="paragraph"){o=i;break}}o===a&&(n.value=n.value.slice(1),n.value.length===0?a.children.shift():a.position&&n.position&&typeof n.position.start.offset=="number"&&(n.position.start.column++,n.position.start.offset++,a.position.start=Object.assign({},n.position.start)))}}this.exit(e)}function CD(e,t,a,n){let l=e.children[0],r=typeof e.checked=="boolean"&&l&&l.type==="paragraph",o="["+(e.checked?"x":" ")+"] ",i=a.createTracker(n);r&&i.move(o);let u=pu.listItem(e,t,a,{...n,...i.current()});return r&&(u=u.replace(/^(?:[*+-]|\d+\.)([\r\n]| {1,3})/,c)),u;function c(s){return s+o}}function ch(){return[Gm(),jm(),Qm(),oh(),uh()]}function fh(e){return{extensions:[Vm(),Xm(e),Ym(),ih(e),sh()]}}var SD={tokenize:TD,partial:!0},p0={tokenize:DD,partial:!0},m0={tokenize:MD,partial:!0},h0={tokenize:ED,partial:!0},kD={tokenize:zD,partial:!0},g0={name:"wwwAutolink",tokenize:ID,previous:y0},x0={name:"protocolAutolink",tokenize:AD,previous:b0},In={name:"emailAutolink",tokenize:wD,previous:L0},Ga={};function ph(){return{text:Ga}}var ir=48;for(;ir<123;)Ga[ir]=In,ir++,ir===58?ir=65:ir===91&&(ir=97);Ga[43]=In;Ga[45]=In;Ga[46]=In;Ga[95]=In;Ga[72]=[In,x0];Ga[104]=[In,x0];Ga[87]=[In,g0];Ga[119]=[In,g0];function wD(e,t,a){let n=this,l,r;return o;function o(f){return!dh(f)||!L0.call(n,n.previous)||mh(n.events)?a(f):(e.enter("literalAutolink"),e.enter("literalAutolinkEmail"),i(f))}function i(f){return dh(f)?(e.consume(f),i):f===64?(e.consume(f),u):a(f)}function u(f){return f===46?e.check(kD,s,c)(f):f===45||f===95||He(f)?(r=!0,e.consume(f),u):s(f)}function c(f){return e.consume(f),l=!0,u}function s(f){return r&&l&&tt(n.previous)?(e.exit("literalAutolinkEmail"),e.exit("literalAutolink"),t(f)):a(f)}}function ID(e,t,a){let n=this;return l;function l(o){return o!==87&&o!==119||!y0.call(n,n.previous)||mh(n.events)?a(o):(e.enter("literalAutolink"),e.enter("literalAutolinkWww"),e.check(SD,e.attempt(p0,e.attempt(m0,r),a),a)(o))}function r(o){return e.exit("literalAutolinkWww"),e.exit("literalAutolink"),t(o)}}function AD(e,t,a){let n=this,l="",r=!1;return o;function o(f){return(f===72||f===104)&&b0.call(n,n.previous)&&!mh(n.events)?(e.enter("literalAutolink"),e.enter("literalAutolinkHttp"),l+=String.fromCodePoint(f),e.consume(f),i):a(f)}function i(f){if(tt(f)&&l.length<5)return l+=String.fromCodePoint(f),e.consume(f),i;if(f===58){let p=l.toLowerCase();if(p==="http"||p==="https")return e.consume(f),u}return a(f)}function u(f){return f===47?(e.consume(f),r?c:(r=!0,u)):a(f)}function c(f){return f===null||Wl(f)||se(f)||Ha(f)||$l(f)?a(f):e.attempt(p0,e.attempt(m0,s),a)(f)}function s(f){return e.exit("literalAutolinkHttp"),e.exit("literalAutolink"),t(f)}}function TD(e,t,a){let n=0;return l;function l(o){return(o===87||o===119)&&n<3?(n++,e.consume(o),l):o===46&&n===3?(e.consume(o),r):a(o)}function r(o){return o===null?a(o):t(o)}}function DD(e,t,a){let n,l,r;return o;function o(c){return c===46||c===95?e.check(h0,u,i)(c):c===null||se(c)||Ha(c)||c!==45&&$l(c)?u(c):(r=!0,e.consume(c),o)}function i(c){return c===95?n=!0:(l=n,n=void 0),e.consume(c),o}function u(c){return l||n||!r?a(c):t(c)}}function MD(e,t){let a=0,n=0;return l;function l(o){return o===40?(a++,e.consume(o),l):o===41&&n<a?r(o):o===33||o===34||o===38||o===39||o===41||o===42||o===44||o===46||o===58||o===59||o===60||o===63||o===93||o===95||o===126?e.check(h0,t,r)(o):o===null||se(o)||Ha(o)?t(o):(e.consume(o),l)}function r(o){return o===41&&n++,e.consume(o),l}}function ED(e,t,a){return n;function n(i){return i===33||i===34||i===39||i===41||i===42||i===44||i===46||i===58||i===59||i===63||i===95||i===126?(e.consume(i),n):i===38?(e.consume(i),r):i===93?(e.consume(i),l):i===60||i===null||se(i)||Ha(i)?t(i):a(i)}function l(i){return i===null||i===40||i===91||se(i)||Ha(i)?t(i):n(i)}function r(i){return tt(i)?o(i):a(i)}function o(i){return i===59?(e.consume(i),n):tt(i)?(e.consume(i),o):a(i)}}function zD(e,t,a){return n;function n(r){return e.consume(r),l}function l(r){return He(r)?a(r):t(r)}}function y0(e){return e===null||e===40||e===42||e===95||e===91||e===93||e===126||se(e)}function b0(e){return!tt(e)}function L0(e){return!(e===47||dh(e))}function dh(e){return e===43||e===45||e===46||e===95||He(e)}function mh(e){let t=e.length,a=!1;for(;t--;){let n=e[t][1];if((n.type==="labelLink"||n.type==="labelImage")&&!n._balanced){a=!0;break}if(n._gfmAutolinkLiteralWalkedInto){a=!1;break}}return e.length>0&&!a&&(e[e.length-1][1]._gfmAutolinkLiteralWalkedInto=!0),a}var BD={tokenize:PD,partial:!0};function hh(){return{document:{91:{name:"gfmFootnoteDefinition",tokenize:qD,continuation:{tokenize:UD},exit:FD}},text:{91:{name:"gfmFootnoteCall",tokenize:ND},93:{name:"gfmPotentialFootnoteCall",add:"after",tokenize:RD,resolveTo:OD}}}}function RD(e,t,a){let n=this,l=n.events.length,r=n.parser.gfmFootnotes||(n.parser.gfmFootnotes=[]),o;for(;l--;){let u=n.events[l][1];if(u.type==="labelImage"){o=u;break}if(u.type==="gfmFootnoteCall"||u.type==="labelLink"||u.type==="label"||u.type==="image"||u.type==="link")break}return i;function i(u){if(!o||!o._balanced)return a(u);let c=Lt(n.sliceSerialize({start:o.end,end:n.now()}));return c.codePointAt(0)!==94||!r.includes(c.slice(1))?a(u):(e.enter("gfmFootnoteCallLabelMarker"),e.consume(u),e.exit("gfmFootnoteCallLabelMarker"),t(u))}}function OD(e,t){let a=e.length,n;for(;a--;)if(e[a][1].type==="labelImage"&&e[a][0]==="enter"){n=e[a][1];break}e[a+1][1].type="data",e[a+3][1].type="gfmFootnoteCallLabelMarker";let l={type:"gfmFootnoteCall",start:Object.assign({},e[a+3][1].start),end:Object.assign({},e[e.length-1][1].end)},r={type:"gfmFootnoteCallMarker",start:Object.assign({},e[a+3][1].end),end:Object.assign({},e[a+3][1].end)};r.end.column++,r.end.offset++,r.end._bufferIndex++;let o={type:"gfmFootnoteCallString",start:Object.assign({},r.end),end:Object.assign({},e[e.length-1][1].start)},i={type:"chunkString",contentType:"string",start:Object.assign({},o.start),end:Object.assign({},o.end)},u=[e[a+1],e[a+2],["enter",l,t],e[a+3],e[a+4],["enter",r,t],["exit",r,t],["enter",o,t],["enter",i,t],["exit",i,t],["exit",o,t],e[e.length-2],e[e.length-1],["exit",l,t]];return e.splice(a,e.length-a+1,...u),e}function ND(e,t,a){let n=this,l=n.parser.gfmFootnotes||(n.parser.gfmFootnotes=[]),r=0,o;return i;function i(f){return e.enter("gfmFootnoteCall"),e.enter("gfmFootnoteCallLabelMarker"),e.consume(f),e.exit("gfmFootnoteCallLabelMarker"),u}function u(f){return f!==94?a(f):(e.enter("gfmFootnoteCallMarker"),e.consume(f),e.exit("gfmFootnoteCallMarker"),e.enter("gfmFootnoteCallString"),e.enter("chunkString").contentType="string",c)}function c(f){if(r>999||f===93&&!o||f===null||f===91||se(f))return a(f);if(f===93){e.exit("chunkString");let p=e.exit("gfmFootnoteCallString");return l.includes(Lt(n.sliceSerialize(p)))?(e.enter("gfmFootnoteCallLabelMarker"),e.consume(f),e.exit("gfmFootnoteCallLabelMarker"),e.exit("gfmFootnoteCall"),t):a(f)}return se(f)||(o=!0),r++,e.consume(f),f===92?s:c}function s(f){return f===91||f===92||f===93?(e.consume(f),r++,c):c(f)}}function qD(e,t,a){let n=this,l=n.parser.gfmFootnotes||(n.parser.gfmFootnotes=[]),r,o=0,i;return u;function u(h){return e.enter("gfmFootnoteDefinition")._container=!0,e.enter("gfmFootnoteDefinitionLabel"),e.enter("gfmFootnoteDefinitionLabelMarker"),e.consume(h),e.exit("gfmFootnoteDefinitionLabelMarker"),c}function c(h){return h===94?(e.enter("gfmFootnoteDefinitionMarker"),e.consume(h),e.exit("gfmFootnoteDefinitionMarker"),e.enter("gfmFootnoteDefinitionLabelString"),e.enter("chunkString").contentType="string",s):a(h)}function s(h){if(o>999||h===93&&!i||h===null||h===91||se(h))return a(h);if(h===93){e.exit("chunkString");let y=e.exit("gfmFootnoteDefinitionLabelString");return r=Lt(n.sliceSerialize(y)),e.enter("gfmFootnoteDefinitionLabelMarker"),e.consume(h),e.exit("gfmFootnoteDefinitionLabelMarker"),e.exit("gfmFootnoteDefinitionLabel"),p}return se(h)||(i=!0),o++,e.consume(h),h===92?f:s}function f(h){return h===91||h===92||h===93?(e.consume(h),o++,s):s(h)}function p(h){return h===58?(e.enter("definitionMarker"),e.consume(h),e.exit("definitionMarker"),l.includes(r)||l.push(r),J(e,d,"gfmFootnoteDefinitionWhitespace")):a(h)}function d(h){return t(h)}}function UD(e,t,a){return e.check(_a,t,e.attempt(BD,t,a))}function FD(e){e.exit("gfmFootnoteDefinition")}function PD(e,t,a){let n=this;return J(e,l,"gfmFootnoteDefinitionIndent",5);function l(r){let o=n.events[n.events.length-1];return o&&o[1].type==="gfmFootnoteDefinitionIndent"&&o[2].sliceSerialize(o[1],!0).length===4?t(r):a(r)}}function gh(e){let a=(e||{}).singleTilde,n={name:"strikethrough",tokenize:r,resolveAll:l};return a==null&&(a=!0),{text:{126:n},insideSpan:{null:[n]},attentionMarkers:{null:[126]}};function l(o,i){let u=-1;for(;++u<o.length;)if(o[u][0]==="enter"&&o[u][1].type==="strikethroughSequenceTemporary"&&o[u][1]._close){let c=u;for(;c--;)if(o[c][0]==="exit"&&o[c][1].type==="strikethroughSequenceTemporary"&&o[c][1]._open&&o[u][1].end.offset-o[u][1].start.offset===o[c][1].end.offset-o[c][1].start.offset){o[u][1].type="strikethroughSequence",o[c][1].type="strikethroughSequence";let s={type:"strikethrough",start:Object.assign({},o[c][1].start),end:Object.assign({},o[u][1].end)},f={type:"strikethroughText",start:Object.assign({},o[c][1].end),end:Object.assign({},o[u][1].start)},p=[["enter",s,i],["enter",o[c][1],i],["exit",o[c][1],i],["enter",f,i]],d=i.parser.constructs.insideSpan.null;d&&ot(p,p.length,0,dl(d,o.slice(c+1,u),i)),ot(p,p.length,0,[["exit",f,i],["enter",o[u][1],i],["exit",o[u][1],i],["exit",s,i]]),ot(o,c-1,u-c+3,p),u=c+p.length-2;break}}for(u=-1;++u<o.length;)o[u][1].type==="strikethroughSequenceTemporary"&&(o[u][1].type="data");return o}function r(o,i,u){let c=this.previous,s=this.events,f=0;return p;function p(h){return c===126&&s[s.length-1][1].type!=="characterEscape"?u(h):(o.enter("strikethroughSequenceTemporary"),d(h))}function d(h){let y=fo(c);if(h===126)return f>1?u(h):(o.consume(h),f++,d);if(f<2&&!a)return u(h);let k=o.exit("strikethroughSequenceTemporary"),g=fo(h);return k._open=!g||g===2&&!!y,k._close=!y||y===2&&!!g,i(h)}}}var Rc=class{constructor(){this.map=[],this.index=new Map}add(t,a,n){HD(this,t,a,n)}consume(t){if(this.map.sort(function(r,o){return r[0]-o[0]}),this.map.length===0)return;let a=this.map.length,n=[];for(;a>0;)a-=1,n.push(t.slice(this.map[a][0]+this.map[a][1]),this.map[a][2]),t.length=this.map[a][0];n.push(t.slice()),t.length=0;let l=n.pop();for(;l;){for(let r of l)t.push(r);l=n.pop()}this.map.length=0,this.index.clear()}};function HD(e,t,a,n){if(a===0&&n.length===0)return;let l=e.index.get(t);if(l){l[1]+=a,l[2].push(...n);return}let r=[t,a,n];e.map.push(r),e.index.set(t,r)}function v0(e,t){let a=!1,n=[];for(;t<e.length;){let l=e[t];if(a){if(l[0]==="enter")l[1].type==="tableContent"&&n.push(e[t+1][1].type==="tableDelimiterMarker"?"left":"none");else if(l[1].type==="tableContent"){if(e[t-1][1].type==="tableDelimiterMarker"){let r=n.length-1;n[r]=n[r]==="left"?"center":"right"}}else if(l[1].type==="tableDelimiterRow")break}else l[0]==="enter"&&l[1].type==="tableDelimiterRow"&&(a=!0);t+=1}return n}function xh(){return{flow:{null:{name:"table",tokenize:_D,resolveAll:GD}}}}function _D(e,t,a){let n=this,l=0,r=0,o;return i;function i(w){let ne=n.events.length-1;for(;ne>-1;){let{type:E}=n.events[ne][1];if(E==="lineEnding"||E==="linePrefix")ne--;else break}let te=ne>-1?n.events[ne][1].type:null,z=te==="tableHead"||te==="tableRow"?v:u;return z===v&&n.parser.lazy[n.now().line]?a(w):z(w)}function u(w){return e.enter("tableHead"),e.enter("tableRow"),c(w)}function c(w){return w===124||(o=!0,r+=1),s(w)}function s(w){return w===null?a(w):H(w)?r>1?(r=0,n.interrupt=!0,e.exit("tableRow"),e.enter("lineEnding"),e.consume(w),e.exit("lineEnding"),d):a(w):K(w)?J(e,s,"whitespace")(w):(r+=1,o&&(o=!1,l+=1),w===124?(e.enter("tableCellDivider"),e.consume(w),e.exit("tableCellDivider"),o=!0,s):(e.enter("data"),f(w)))}function f(w){return w===null||w===124||se(w)?(e.exit("data"),s(w)):(e.consume(w),w===92?p:f)}function p(w){return w===92||w===124?(e.consume(w),f):f(w)}function d(w){return n.interrupt=!1,n.parser.lazy[n.now().line]?a(w):(e.enter("tableDelimiterRow"),o=!1,K(w)?J(e,h,"linePrefix",n.parser.constructs.disable.null.includes("codeIndented")?void 0:4)(w):h(w))}function h(w){return w===45||w===58?k(w):w===124?(o=!0,e.enter("tableCellDivider"),e.consume(w),e.exit("tableCellDivider"),y):I(w)}function y(w){return K(w)?J(e,k,"whitespace")(w):k(w)}function k(w){return w===58?(r+=1,o=!0,e.enter("tableDelimiterMarker"),e.consume(w),e.exit("tableDelimiterMarker"),g):w===45?(r+=1,g(w)):w===null||H(w)?S(w):I(w)}function g(w){return w===45?(e.enter("tableDelimiterFiller"),m(w)):I(w)}function m(w){return w===45?(e.consume(w),m):w===58?(o=!0,e.exit("tableDelimiterFiller"),e.enter("tableDelimiterMarker"),e.consume(w),e.exit("tableDelimiterMarker"),x):(e.exit("tableDelimiterFiller"),x(w))}function x(w){return K(w)?J(e,S,"whitespace")(w):S(w)}function S(w){return w===124?h(w):w===null||H(w)?!o||l!==r?I(w):(e.exit("tableDelimiterRow"),e.exit("tableHead"),t(w)):I(w)}function I(w){return a(w)}function v(w){return e.enter("tableRow"),T(w)}function T(w){return w===124?(e.enter("tableCellDivider"),e.consume(w),e.exit("tableCellDivider"),T):w===null||H(w)?(e.exit("tableRow"),t(w)):K(w)?J(e,T,"whitespace")(w):(e.enter("data"),N(w))}function N(w){return w===null||w===124||se(w)?(e.exit("data"),T(w)):(e.consume(w),w===92?U:N)}function U(w){return w===92||w===124?(e.consume(w),N):N(w)}}function GD(e,t){let a=-1,n=!0,l=0,r=[0,0,0,0],o=[0,0,0,0],i=!1,u=0,c,s,f,p=new Rc;for(;++a<e.length;){let d=e[a],h=d[1];d[0]==="enter"?h.type==="tableHead"?(i=!1,u!==0&&(C0(p,t,u,c,s),s=void 0,u=0),c={type:"table",start:Object.assign({},h.start),end:Object.assign({},h.end)},p.add(a,0,[["enter",c,t]])):h.type==="tableRow"||h.type==="tableDelimiterRow"?(n=!0,f=void 0,r=[0,0,0,0],o=[0,a+1,0,0],i&&(i=!1,s={type:"tableBody",start:Object.assign({},h.start),end:Object.assign({},h.end)},p.add(a,0,[["enter",s,t]])),l=h.type==="tableDelimiterRow"?2:s?3:1):l&&(h.type==="data"||h.type==="tableDelimiterMarker"||h.type==="tableDelimiterFiller")?(n=!1,o[2]===0&&(r[1]!==0&&(o[0]=o[1],f=Oc(p,t,r,l,void 0,f),r=[0,0,0,0]),o[2]=a)):h.type==="tableCellDivider"&&(n?n=!1:(r[1]!==0&&(o[0]=o[1],f=Oc(p,t,r,l,void 0,f)),r=o,o=[r[1],a,0,0])):h.type==="tableHead"?(i=!0,u=a):h.type==="tableRow"||h.type==="tableDelimiterRow"?(u=a,r[1]!==0?(o[0]=o[1],f=Oc(p,t,r,l,a,f)):o[1]!==0&&(f=Oc(p,t,o,l,a,f)),l=0):l&&(h.type==="data"||h.type==="tableDelimiterMarker"||h.type==="tableDelimiterFiller")&&(o[3]=a)}for(u!==0&&C0(p,t,u,c,s),p.consume(t.events),a=-1;++a<t.events.length;){let d=t.events[a];d[0]==="enter"&&d[1].type==="table"&&(d[1]._align=v0(t.events,a))}return e}function Oc(e,t,a,n,l,r){let o=n===1?"tableHeader":n===2?"tableDelimiter":"tableData",i="tableContent";a[0]!==0&&(r.end=Object.assign({},yo(t.events,a[0])),e.add(a[0],0,[["exit",r,t]]));let u=yo(t.events,a[1]);if(r={type:o,start:Object.assign({},u),end:Object.assign({},u)},e.add(a[1],0,[["enter",r,t]]),a[2]!==0){let c=yo(t.events,a[2]),s=yo(t.events,a[3]),f={type:i,start:Object.assign({},c),end:Object.assign({},s)};if(e.add(a[2],0,[["enter",f,t]]),n!==2){let p=t.events[a[2]],d=t.events[a[3]];if(p[1].end=Object.assign({},d[1].end),p[1].type="chunkText",p[1].contentType="text",a[3]>a[2]+1){let h=a[2]+1,y=a[3]-a[2]-1;e.add(h,y,[])}}e.add(a[3]+1,0,[["exit",f,t]])}return l!==void 0&&(r.end=Object.assign({},yo(t.events,l)),e.add(l,0,[["exit",r,t]]),r=void 0),r}function C0(e,t,a,n,l){let r=[],o=yo(t.events,a);l&&(l.end=Object.assign({},o),r.push(["exit",l,t])),n.end=Object.assign({},o),r.push(["exit",n,t]),e.add(a+1,0,r)}function yo(e,t){let a=e[t],n=a[0]==="enter"?"start":"end";return a[1][n]}var VD={name:"tasklistCheck",tokenize:jD};function yh(){return{text:{91:VD}}}function jD(e,t,a){let n=this;return l;function l(u){return n.previous!==null||!n._gfmTasklistFirstContentOfListItem?a(u):(e.enter("taskListCheck"),e.enter("taskListCheckMarker"),e.consume(u),e.exit("taskListCheckMarker"),r)}function r(u){return se(u)?(e.enter("taskListCheckValueUnchecked"),e.consume(u),e.exit("taskListCheckValueUnchecked"),o):u===88||u===120?(e.enter("taskListCheckValueChecked"),e.consume(u),e.exit("taskListCheckValueChecked"),o):a(u)}function o(u){return u===93?(e.enter("taskListCheckMarker"),e.consume(u),e.exit("taskListCheckMarker"),e.exit("taskListCheck"),i):a(u)}function i(u){return H(u)?t(u):K(u)?e.check({tokenize:XD},t,a)(u):a(u)}}function XD(e,t,a){return J(e,n,"whitespace");function n(l){return l===null?a(l):t(l)}}function S0(e){return oc([ph(),hh(),gh(e),xh(),yh()])}var QD={};function bo(e){let t=this,a=e||QD,n=t.data(),l=n.micromarkExtensions||(n.micromarkExtensions=[]),r=n.fromMarkdownExtensions||(n.fromMarkdownExtensions=[]),o=n.toMarkdownExtensions||(n.toMarkdownExtensions=[]);l.push(S0(a)),r.push(ch()),o.push(fh(a))}var wa=class extends Error{constructor(a,n,l){super(a);this.status=n;this.code=l}},ur=()=>globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,pe=encodeURIComponent;function Lo(e){if(!(typeof e!="string"||!e.trim()))try{let t=new URL(e,window.location.origin);return["http:","https:"].includes(t.protocol)?t.href:void 0}catch{return}}async function bh(e,t={}){let a=new AbortController,n=()=>a.abort();t.signal?.aborted&&a.abort(),t.signal?.addEventListener("abort",n,{once:!0});let l=setTimeout(n,35e3),r=t.body instanceof FormData,o={Accept:"application/json"};r||(o["Content-Type"]="application/json"),window.init?.csrfNonce&&(o["CSRF-Token"]=window.init.csrfNonce,r&&t.body.set("nonce",window.init.csrfNonce)),t.key&&(o["Idempotency-Key"]=t.key);try{let i=await fetch(`/pwncollege_api/v1${e}`,{credentials:"same-origin",method:t.method||"GET",headers:o,body:t.body===void 0?void 0:r?t.body:JSON.stringify(t.body),signal:a.signal}),u;try{u=await i.json()}catch{throw new wa(i.status===413?"\u6587\u4EF6\u8D85\u8FC7\u4E0A\u4F20\u9650\u5236\uFF0C\u8BF7\u62C6\u5206\u540E\u91CD\u8BD5\u3002":"\u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u54CD\u5E94\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",i.status)}if(!i.ok||u.success===!1){let c=typeof u.error=="object"?u.error?.message:u.error;throw new wa(c||u.message||(Array.isArray(u.errors)&&typeof u.errors[0]=="string"?u.errors[0]:"")||(i.status===401?"\u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55\u3002":"\u64CD\u4F5C\u672A\u5B8C\u6210\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002"),i.status,u.errorCode||u.error?.code)}return u.data??u}finally{clearTimeout(l),t.signal?.removeEventListener("abort",n)}}var Re=(e,t)=>bh("/teaching"+e,t);function k0(e,t){let a=new Set(e.map(Nc)),n=[...e];for(let l of t)a.has(Nc(l))||(a.add(Nc(l)),n.push(l));return n}function Nc(e){return String(e.id||`${e.sourceJobId||e.details?.agentRun?.runId}:${e.sourceSequence??e.sequence??e.details?.agentRun?.seq}`)}function qc(e,t,a=!1){let n=new Map,l=[];for(let r of t){let o=r.details?.agentRun;if(o?.runId&&o?.type){let i=n.get(o.runId)||[];i.push(o),n.set(o.runId,i)}else(r.message||r.label)&&l.push({id:Nc(r),jobId:e,runId:"",kind:"workflow",title:String(r.message||r.label),status:r.status==="FAILED"?"failed":"completed"})}for(let[r,o]of n){let i=new Map,u=!1,c="incomplete";for(let s of o.sort((f,p)=>Number(f.seq)-Number(p.seq))){if(s.type==="item.started"&&s.item?.id&&!i.has(s.item.id)){let p={...s.item,id:`${r}:${s.item.id}`,jobId:e,runId:r,status:s.item.status||"running"};i.set(s.item.id,p),l.push(p)}let f=i.get(s.itemId);if(f&&s.type==="item.delta"){let p=s.channel==="output"?"output":"content";f[p]=(f[p]||"")+(typeof s.delta=="string"?s.delta:"")}if(f&&s.type==="item.updated")for(let p of["kind","title","subtitle","content","output","input","command","cwd","exitCode","status","usage","metadata"])s.patch?.[p]!==void 0&&(f[p]=s.patch[p]);f&&s.type==="item.completed"&&Object.assign(f,{status:s.status||"completed",completedAt:s.time},s.output!==void 0?{output:s.output}:{},s.exitCode!==void 0?{exitCode:s.exitCode}:{},s.metadata!==void 0?{metadata:{...f.metadata,...s.metadata}}:{}),["run.completed","run.failed","run.cancelled"].includes(s.type)&&(u=!0,c=s.type==="run.failed"?"failed":s.type==="run.cancelled"?"cancelled":"incomplete",(s.error||s.reason)&&l.push({id:`${r}:end`,jobId:e,runId:r,kind:"workflow",title:"\u6267\u884C\u7ED3\u675F",content:String(s.error||s.reason),status:c}))}if(u||a)for(let s of i.values())s.status==="running"&&(s.status=c)}return l}function w0(e){let t=/"(?:answer|message)"\s*:\s*"/.exec(e);if(!t)return e.trimStart().startsWith("{")?"":e;let a=t.index+t[0].length,n="",l=!1;for(let r=a;r<e.length;r++){let o=e[r];if(l){if(o==="u"){let i=e.slice(r+1,r+5);if(i.length<4)break;/^[a-f0-9]{4}$/i.test(i)&&(n+=String.fromCharCode(parseInt(i,16)),r+=4)}else n+={n:`
`,r:"\r",t:"	"}[o]??o;l=!1}else if(o==="\\")l=!0;else{if(o==='"')break;n+=o}}return n}function Lh(e,t){return t?.version===1&&t.requestId===e.id&&t.requestSha256===e.sha256&&(t.decision==="APPROVED"||t.decision==="REJECTED")}function vh(e){return typeof e=="string"&&/^[A-Za-z0-9_-]{1,48}$/.test(e)}function Uc(e,t,a){let n=t.metadata.toolProposals?.[a],l=t.metadata.toolProposalApprovalRequests?.[String(a)],r=n?.arguments;if(t.role!=="assistant"||t.metadata.pending!==!1||e.status!=="ACTIVE"||!Number.isSafeInteger(e.dojoId)||n?.tool!=="classroom.prepare"||n.requiresConfirmation!==!0||n.boundScope?.dojoId!==e.dojoId||n.boundScope?.moduleIndex!==(e.moduleIndex??null)||typeof r?.artifactId!="string"||!r.artifactId||!Number.isSafeInteger(r.expectedRevision)||r.expectedRevision<1||typeof r.contentHash!="string"||!/^[a-f0-9]{64}$/.test(r.contentHash)||typeof l?.id!="string"||!l.id||typeof l.sha256!="string"||!/^[a-f0-9]{64}$/.test(l.sha256))return null;let o={id:l.id,sha256:l.sha256},i=t.metadata.toolProposalDecisions?.[String(a)];if(i&&!Lh(o,i))return null;let u=t.metadata.toolExecutionResults?.[String(a)],c=i?.decision==="APPROVED"&&u?.tool==="classroom.prepare"&&u.status==="SUCCEEDED"&&u.artifactId===r.artifactId&&u.artifactRevision===r.expectedRevision&&vh(u.sessionId)?u.sessionId:null;return{approval:o,decision:i?.decision,artifactId:r.artifactId,revision:r.expectedRevision,sessionId:c}}function I0(e,t){return"/teacher?"+new URLSearchParams({view:"dashboard",thread:e,classroom:t})}var hl=W(_e(),1);function YD(e){return(e.match(/[^。！？.!?\n]{1,160}[。！？.!?]*|[。！？.!?]+/gu)||[]).map(a=>a.trim()).filter(Boolean)}function A0(e,t){let[a,n]=(0,hl.useState)(null),l=(0,hl.useRef)(null),r=typeof window.speechSynthesis<"u"&&typeof window.SpeechSynthesisUtterance=="function",o=(0,hl.useCallback)(()=>{l.current&&(l.current=null,window.speechSynthesis.cancel()),n(null)},[]);return(0,hl.useEffect)(()=>o,[e,o]),{speakingId:a,supported:r,toggle:(u,c)=>{if(!r)return;let s=l.current?.messageId===u;if(o(),s)return;let f=YD(c);if(!f.length)return;let p=window.speechSynthesis,d=p.getVoices().filter(m=>m.localService),h=/\p{Script=Han}/u.test(c)?"zh":/[a-z]/i.test(c)?"en":navigator.language,y=d.find(m=>m.lang.toLowerCase().startsWith(h.toLowerCase()))||d.find(m=>m.default)||d[0];if(!y){t(new Error("\u6CA1\u6709\u53EF\u7528\u7684\u672C\u5730\u6717\u8BFB\u8BED\u97F3\uFF0C\u8BF7\u5728\u8BBE\u5907\u7684\u8BED\u97F3\u8BBE\u7F6E\u4E2D\u542F\u7528\u3002"));return}let k={messageId:u};l.current=k,n(u);let g=m=>{if(l.current!==k)return;if(m>=f.length){o();return}let x=new SpeechSynthesisUtterance(f[m]);k.utterance=x,x.voice=y,x.lang=y.lang,x.onend=()=>g(m+1),x.onerror=()=>{l.current===k&&(o(),t(new Error("\u6717\u8BFB\u5DF2\u4E2D\u65AD\uFF0C\u8BF7\u91CD\u8BD5\u3002")))},p.speak(x)};g(0)},stop:o}}var T0=new Intl.DateTimeFormat("zh-CN",{hour:"2-digit",minute:"2-digit",hourCycle:"h23"}),KD=new Intl.DateTimeFormat("zh-CN",{month:"numeric",day:"numeric"}),ZD=new Intl.DateTimeFormat("zh-CN",{year:"numeric",month:"numeric",day:"numeric"}),JD=1800*1e3;function mu(e){if(!e)return;let t=new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(e)?e:e+"Z");return Number.isFinite(t.getTime())?t:void 0}function Ch(e,t){return e.getFullYear()===t.getFullYear()&&e.getMonth()===t.getMonth()&&e.getDate()===t.getDate()}function Sh(e,t=new Date){let a=new Date(t.getFullYear(),t.getMonth(),t.getDate()-1);return`${Ch(e,t)?"\u4ECA\u5929":Ch(e,a)?"\u6628\u5929":(e.getFullYear()===t.getFullYear()?KD:ZD).format(e)} ${T0.format(e)}`}function D0(e,t,a){if(!t||!Ch(t,e))return!0;let n=a&&a>t?a:t;return e.getTime()-n.getTime()>=JD}var M0=e=>T0.format(e);var Va=W(_e(),1);var xe=W(Le(),1),E0=e=>e.title||e.content?.title||"\u751F\u6210\u6210\u54C1";function WD({candidateSetId:e,candidates:t,close:a}){let{controller:n,state:l}=ue(),[r,o]=(0,Va.useState)([]),[i,u]=(0,Va.useState)(""),[c,s]=(0,Va.useState)(3),[f,p]=(0,Va.useState)(""),[d,h]=(0,Va.useState)(null),y=t.filter(x=>r.includes(x.id)).map(x=>x.id),k={candidateIds:y,instruction:i.trim(),candidateCount:c},g=JSON.stringify(k),m=d&&l.jobs.find(x=>x.id===d.jobId);return(0,xe.jsxs)("details",{className:"candidate-derive",children:[(0,xe.jsx)("summary",{children:"\u4ECE\u73B0\u6709\u65B9\u6848\u6D3E\u751F"}),(0,xe.jsxs)("form",{onSubmit:x=>{x.preventDefault(),!(!y.length||!k.instruction||d?.signature===g)&&n.run(async()=>{p("");try{let S=await n.deriveDebateCandidates(e,k);h({jobId:S.id,status:S.status,signature:g})}catch(S){p(S instanceof Error?S.message:"\u65E0\u6CD5\u63D0\u4EA4\u6D3E\u751F\u4EFB\u52A1\uFF0C\u8BF7\u91CD\u8BD5\u3002")}})},children:[(0,xe.jsxs)("fieldset",{disabled:l.busy,children:[(0,xe.jsx)("legend",{children:"\u9009\u62E9\u4E00\u81F3\u56DB\u4EFD\u53C2\u8003\u65B9\u6848"}),t.map(x=>(0,xe.jsxs)("label",{className:"candidate-derive-option",children:[(0,xe.jsx)("input",{type:"checkbox",checked:r.includes(x.id),disabled:r.length>=4&&!r.includes(x.id),onChange:S=>{let I=S.currentTarget.checked;o(v=>I?[...v,x.id]:v.filter(T=>T!==x.id))}}),E0(x)]},x.id))]}),(0,xe.jsxs)("label",{className:"field",children:["\u6D3E\u751F\u8981\u6C42",(0,xe.jsx)("textarea",{value:i,onChange:x=>u(x.target.value),rows:3,maxLength:16e3,required:!0,disabled:l.busy})]}),(0,xe.jsxs)("label",{className:"field",children:["\u65B0\u65B9\u6848\u6570\u91CF",(0,xe.jsx)("select",{value:c,onChange:x=>s(Number(x.target.value)),disabled:l.busy,children:[2,3,4].map(x=>(0,xe.jsxs)("option",{value:x,children:[x," \u4EFD"]},x))})]}),(0,xe.jsx)(P,{type:"submit",className:"primary",disabled:l.busy||!y.length||!k.instruction||d?.signature===g,children:"\u751F\u6210\u65B0\u8FA9\u8BBA\u65B9\u6848"}),f&&(0,xe.jsx)("p",{className:"candidate-derive-result",role:"alert",children:f}),d&&(0,xe.jsxs)("div",{className:"candidate-derive-result",children:[(0,xe.jsxs)("p",{role:"status",children:["\u6D3E\u751F\u4EFB\u52A1\u5DF2\u63D0\u4EA4\u3002",(0,xe.jsx)($t,{status:m?.status||d.status})," \u5B8C\u6210\u540E\u53EF\u5728\u4EFB\u52A1\u4E2D\u5FC3\u67E5\u770B\u8FA9\u8BBA\u5019\u9009\u3002"]}),(0,xe.jsx)(P,{onClick:()=>{n.patch({taskCenter:!0}),a()},children:"\u6253\u5F00\u4EFB\u52A1\u4E2D\u5FC3"})]})]})]})}function Fc({candidateSetId:e,close:t}){let{state:a,controller:n}=ue(),[l,r]=(0,Va.useState)(null),[o,i]=(0,Va.useState)("");(0,Va.useEffect)(()=>{let f=new AbortController;return Re(`/candidate-sets/${pe(e)}`,{signal:f.signal}).then(p=>{f.signal.aborted||r(p.candidateSet)}).catch(p=>{f.signal.aborted||i(p instanceof Error?p.message:"\u65E0\u6CD5\u8BFB\u53D6\u751F\u6210\u7ED3\u679C\u3002")}),()=>f.abort()},[e]);let u=l?.candidates||[],c=l?.request?.generationReason==="teacher_requested_native_courseware",s=l?.kind==="debate"&&!l.selfWorkspaceId&&l.request?.generationReason==="teacher_requested_ordinary_debate";return(0,xe.jsx)(ma,{title:c?"\u9009\u62E9\u8BFE\u4EF6\u65B9\u6848":"\u5BA1\u9605\u751F\u6210\u6210\u54C1",onClose:t,wide:!0,children:(0,xe.jsxs)("div",{className:"dialog-body",children:[o?(0,xe.jsx)("p",{role:"alert",children:o}):l?u.map(f=>(0,xe.jsxs)("section",{className:"candidate",children:[(0,xe.jsx)("h3",{children:E0(f)}),(0,xe.jsx)("p",{children:f.summary||f.content?.summary}),f.validation?.status&&(0,xe.jsx)($t,{status:f.validation.status}),(0,xe.jsxs)("details",{children:[(0,xe.jsx)("summary",{children:"\u68C0\u67E5\u751F\u6210\u5185\u5BB9"}),(0,xe.jsx)(Sa,{value:f.content})]}),(0,xe.jsx)(P,{className:"primary",disabled:a.busy,onClick:()=>void n.run(async()=>{let p=await Re(`/candidates/${pe(f.id)}/materialize`,{method:"POST",body:{}});await n.loadArtifacts(),p.artifact?.id&&(await n.openArtifact(p.artifact.id),t())}),children:c?"\u751F\u6210\u8BFE\u4EF6":"\u6253\u5F00\u6210\u54C1\u5DE5\u4F5C\u533A"})]},f.id)):(0,xe.jsx)("p",{children:"\u6B63\u5728\u8BFB\u53D6\u2026"}),s&&u.length>0&&(0,xe.jsx)(WD,{candidateSetId:e,candidates:u,close:t})]})})}var Ia=W(_e(),1);var hu=[{title:"\u5E73\u53F0\u6559\u6848",subtitle:"\u6BD4\u8F83\u5019\u9009\uFF0C\u751F\u6210\u5E73\u53F0\u6210\u54C1",prompt:"\u8BF7\u751F\u6210\u666E\u901A\u6559\u6848\u5019\u9009\uFF1A"},{title:"\u8BFE\u5802\u8FA9\u8BBA",subtitle:"\u8BBE\u8BA1\u8FA9\u9898\u3001\u7ACB\u573A\u4E0E\u6D41\u7A0B",prompt:"\u8BF7\u751F\u6210\u666E\u901A\u8BFE\u5802\u8FA9\u8BBA\u5019\u9009\u65B9\u6848\uFF1A"},{title:"\u5236\u4F5C\u8BFE\u4EF6",subtitle:"\u751F\u6210\u53EF\u7F16\u8F91\u7684\u539F\u751F\u5E7B\u706F\u7247",prompt:"\u8BF7\u5236\u4F5C\u4E00\u4EFD\u8BFE\u4EF6\uFF1A"},{title:"\u52A8\u6001\u4EFF\u771F",subtitle:"\u8BBE\u8BA1\u53EF\u8C03\u8282\u3001\u53EF\u6BD4\u8F83\u7684\u6A21\u62DF",prompt:"\u8BF7\u5236\u4F5C\u4E00\u4E2A\u52A8\u6001\u4EFF\u771F\uFF1A"}];function Pc(e){return e.type==="slide-deck"&&e.revision?.content?.ordinaryCourseware==="teaching-courseware-v1"}function Hc({context:e,thread:t}){let a=e.ordinaryProjectCourseIds||[];return t?.dojoId==null?a.length===1:a.includes(t.dojoId)}function z0(e,t){let a=t.trim(),n=hu.find(({prompt:l})=>a.startsWith(l));return e+(n?a.slice(n.prompt.length):a)}function _c(e){return e.replace(/(^|[。！？\n]\s*)当前(?:我|这条对话)只支持文字问答[。.]?(?=\s*(?:$|\n))/gu,(t,a)=>a.trimEnd()).trimEnd()}var F=W(Le(),1);function $D({turn:e}){let{state:t,controller:a}=ue(),[n,l]=(0,Ia.useState)(!1),[r,o]=(0,Ia.useState)(e.content);return(0,F.jsxs)("div",{className:"queue-row",children:[(0,F.jsx)(zi,{size:14}),(0,F.jsxs)("div",{children:[(0,F.jsx)("small",{children:e.delivery==="next-step"?e.acknowledgedAtBoundary?"\u8865\u5145\u5DF2\u63A5\u6536":"\u4E0B\u4E00\u6B65\u8865\u5145":"\u5F53\u524D\u4EFB\u52A1\u540E\u6267\u884C"}),n?(0,F.jsx)("textarea",{"aria-label":"\u4FEE\u6539\u6392\u961F\u8981\u6C42",value:r,onChange:i=>o(i.target.value),rows:3}):(0,F.jsx)("p",{children:e.content})]}),n?(0,F.jsxs)(F.Fragment,{children:[(0,F.jsx)(Y,{label:"\u4FDD\u5B58\u6392\u961F\u8981\u6C42",disabled:t.busy||!r.trim(),onClick:()=>void a.run(async()=>{await a.editQueue(e.jobId,r,e.revision),l(!1)}),children:(0,F.jsx)(Ft,{size:15})}),(0,F.jsx)(Y,{label:"\u53D6\u6D88\u7F16\u8F91",onClick:()=>l(!1),children:(0,F.jsx)(qe,{size:15})})]}):(0,F.jsxs)(F.Fragment,{children:[(0,F.jsx)(Y,{label:"\u7F16\u8F91\u6392\u961F\u8981\u6C42",onClick:()=>{o(e.content),l(!0)},children:(0,F.jsx)(yn,{size:14})}),(0,F.jsx)(Y,{label:"\u64A4\u56DE\u6392\u961F\u8981\u6C42",disabled:t.busy,onClick:()=>void a.run(()=>a.cancel(e.jobId)),children:(0,F.jsx)(qe,{size:15})})]})]})}function kh({welcome:e=!1}){let{state:t,controller:a}=ue(),n=(0,Ia.useRef)(null),l=(0,Ia.useRef)(null),[r,o]=(0,Ia.useState)(!1),[i,u]=(0,Ia.useState)(!1),c=t.draft,s=document.getElementById("cocreation-workbench")?.dataset.scopedTeaching==="true",f=t.jobs.find(y=>y.threadId===t.thread?.id&&!et(y)),p=t.thread?.status==="ARCHIVED",d=!!c.text.trim()&&!t.busy&&!t.loadingThread&&!t.uploads.length&&!p,h=s&&Hc(t);return(0,Ia.useEffect)(()=>{n.current&&(n.current.style.height="auto",n.current.style.height=Math.min(200,n.current.scrollHeight)+"px")},[c.text]),(0,Ia.useEffect)(()=>{let y=()=>n.current?.focus();return window.addEventListener("workbench-focus-composer",y),()=>window.removeEventListener("workbench-focus-composer",y)},[]),(0,F.jsxs)("div",{className:`composer-area ${e?"welcome-composer":""}`,children:[(t.thread?.pendingTurns||[]).length>0&&(0,F.jsx)("div",{className:"queue-dock","aria-label":"\u5F85\u5904\u7406\u8981\u6C42",children:t.thread?.pendingTurns?.map(y=>(0,F.jsx)($D,{turn:y},y.jobId))}),p?(0,F.jsxs)("div",{className:"archive-notice",children:["\u6B64\u4F1A\u8BDD\u5DF2\u5F52\u6863\u3002",(0,F.jsx)(P,{onClick:()=>void a.run(()=>a.updateThread(t.thread.id,{archived:!1})),children:"\u6062\u590D\u4F1A\u8BDD"})]}):(0,F.jsxs)("div",{className:`composer ${i?"dragging":""}`,onDragOver:y=>{y.preventDefault(),u(!0)},onDragLeave:y=>{y.currentTarget.contains(y.relatedTarget)||u(!1)},onDrop:y=>{y.preventDefault(),u(!1),y.dataTransfer.files.length&&a.upload([...y.dataTransfer.files]).catch(a.error)},children:[(c.sources.length>0||c.skills.length>0||t.uploads.length>0)&&(0,F.jsxs)("div",{className:"context-chips",children:[c.sources.map(y=>(0,F.jsxs)("span",{className:"chip",children:[(0,F.jsx)(ul,{size:12}),(0,F.jsx)("span",{children:y.name}),(0,F.jsx)(Y,{label:`\u79FB\u9664\u5F15\u7528 ${y.name}`,onClick:()=>a.setDraft({sources:c.sources.filter(k=>k.id!==y.id)}),children:(0,F.jsx)(qe,{size:12})})]},y.id)),c.skills.map(y=>(0,F.jsxs)("span",{className:"chip",children:[(0,F.jsx)(Pt,{size:12}),"/",y,(0,F.jsx)(Y,{label:`\u79FB\u9664\u6280\u80FD ${y}`,onClick:()=>a.setDraft({skills:c.skills.filter(k=>k!==y)}),children:(0,F.jsx)(qe,{size:12})})]},y)),t.uploads.map(y=>(0,F.jsxs)("span",{className:`chip ${y.state}`,title:y.error,children:[y.state==="uploading"&&(0,F.jsx)(Dt,{size:12,className:"spin"}),(0,F.jsxs)("span",{children:[y.name,y.state==="error"?" \xB7 \u4E0A\u4F20\u5931\u8D25":" \xB7 \u4E0A\u4F20\u4E2D"]}),y.state==="error"&&(0,F.jsx)(Y,{label:"\u79FB\u9664\u5931\u8D25\u4E0A\u4F20",onClick:()=>a.patch({uploads:t.uploads.filter(k=>k.id!==y.id)}),children:(0,F.jsx)(qe,{size:12})})]},y.id))]}),(0,F.jsx)("textarea",{ref:n,id:"workbench-prompt","aria-label":"\u8F93\u5165\u6559\u5B66\u8981\u6C42",placeholder:i?"\u677E\u5F00\u4EE5\u6DFB\u52A0\u6587\u4EF6":h?"\u63CF\u8FF0\u60F3\u505A\u7684\u6559\u6848\u3001\u8BFE\u5802\u6D3B\u52A8\u6216\u8981\u4FEE\u6539\u7684\u5185\u5BB9\u2026":"\u76F4\u63A5\u63D0\u95EE\u3001\u63CF\u8FF0\u6559\u5B66\u76EE\u6807\uFF0C\u6216\u7EE7\u7EED\u4FEE\u6539\u5DF2\u6709\u5185\u5BB9\u2026",value:c.text,rows:1,onChange:y=>a.setDraft({text:y.target.value}),onKeyDown:y=>{y.nativeEvent.isComposing||y.keyCode===229||y.key==="Enter"&&!y.shiftKey&&(y.preventDefault(),d&&a.send(f&&(y.metaKey||y.ctrlKey)?{delivery:c.delivery==="after-current"?"next-step":"after-current"}:{}))}}),(0,F.jsxs)("div",{className:"composer-toolbar",children:[(0,F.jsxs)("div",{className:"add-context",children:[(0,F.jsx)(Y,{label:"\u6DFB\u52A0\u4E0A\u4E0B\u6587","aria-expanded":r,onClick:()=>o(!r),children:(0,F.jsx)(Fa,{size:18})}),r&&(0,F.jsxs)("div",{className:"composer-menu",children:[(0,F.jsxs)(P,{onClick:()=>{o(!1),l.current?.click()},children:[(0,F.jsx)(ul,{size:15}),"\u4E0A\u4F20\u6587\u4EF6"]}),(0,F.jsxs)(P,{onClick:()=>{o(!1),a.openCatalog("sources")},children:[(0,F.jsx)(Oa,{size:15}),"\u5F15\u7528\u8D44\u6599\u5E93"]}),(0,F.jsxs)(P,{onClick:()=>{o(!1),a.openCatalog("skills")},children:[(0,F.jsx)(Pt,{size:15}),"\u9009\u62E9\u6280\u80FD"]})]})]}),(0,F.jsx)("input",{ref:l,type:"file",multiple:!0,hidden:!0,onChange:y=>{y.target.files&&a.upload([...y.target.files]).catch(a.error),y.target.value=""}}),h&&!e&&hu.map(({title:y,prompt:k})=>(0,F.jsx)(P,{className:"teaching-project-button",disabled:t.busy,onClick:()=>{a.setDraft({text:z0(k,c.text),artifactType:"auto",learningPattern:""}),n.current?.focus()},children:y},y)),!s&&(0,F.jsxs)("select",{"aria-label":"\u5B66\u4E60\u6A21\u5F0F",value:c.learningPattern,onChange:y=>a.setDraft({learningPattern:y.target.value}),children:[(0,F.jsx)("option",{value:"",children:"\u901A\u7528\u521B\u4F5C"}),(0,F.jsx)("option",{value:"process-inquiry",children:"\u6D41\u7A0B\u63A2\u7A76 \xB7 AES-128"})]}),(0,F.jsx)("div",{className:"push"}),f&&(0,F.jsxs)("select",{"aria-label":"\u53D1\u9001\u65F6\u673A",value:c.delivery,onChange:y=>a.setDraft({delivery:y.target.value}),children:[(0,F.jsx)("option",{value:"after-current",children:"\u6392\u961F"}),(0,F.jsx)("option",{value:"next-step",children:"\u4E0B\u4E00\u6B65\u8865\u5145"})]}),f&&(0,F.jsx)(Y,{label:"\u505C\u6B62\u5F53\u524D\u4EFB\u52A1",className:"stop-button",disabled:t.busy,onClick:()=>void a.run(()=>a.cancel(f.id)),children:(0,F.jsx)(vn,{size:14,fill:"currentColor"})}),!s&&Js(c.sources)&&(0,F.jsx)(P,{disabled:!d,onClick:()=>void a.send({},"ask"),children:"\u4EC5\u95EE\u7B54"}),(0,F.jsx)(Y,{label:t.busy?"\u6B63\u5728\u63D0\u4EA4":f?c.delivery==="next-step"?"\u4E0B\u4E00\u6B65\u8865\u5145":"\u52A0\u5165\u961F\u5217":"\u53D1\u9001\u8981\u6C42",className:"send-button",disabled:!d,onClick:()=>void a.send(),children:t.busy?(0,F.jsx)(Dt,{size:17,className:"spin"}):(0,F.jsx)(Ul,{size:19})})]})]}),(0,F.jsxs)("div",{className:"composer-footnote",children:[f&&(0,F.jsx)("span",{children:"\u5173\u95ED\u9875\u9762\u540E\uFF0C\u4EFB\u52A1\u4ECD\u5728\u540E\u53F0\u6267\u884C"}),(0,F.jsxs)("span",{children:[(0,F.jsx)(Bi,{size:11})," \u53D1\u9001"," ",(0,F.jsx)("span",{className:"desktop-only",children:" \xB7 Shift Enter \u6362\u884C"})]})]})]})}var B0=W(_e(),1);var Ct=W(Le(),1);function R0({bundle:e,option:t,messageId:a,onClose:n}){let{state:l,controller:r}=ue(),o=Math.max(1,Number(e.baseArguments?.challengeCount||1)),[i,u]=(0,B0.useState)(()=>Array.from({length:o},(s,f)=>({itemIndex:f+1,title:String(e.baseArguments?.constraints?.batchTopics?.[f]||`${t.title}${o>1?` \xB7 \u7B2C ${f+1} \u9898`:""}`).slice(0,80),difficulty:o===3?["\u7B80\u5355","\u4E2D\u7B49","\u56F0\u96BE"][f]:"\u6309\u5F53\u524D\u65B9\u6848"}))),c=i.every(s=>s.title.trim().length>=2)&&new Set(i.map(s=>s.title.trim())).size===o;return(0,Ct.jsxs)(ma,{title:"\u786E\u8BA4\u5B9E\u8DF5\u9898\u751F\u6210",onClose:n,children:[(0,Ct.jsxs)("div",{className:"dialog-body",children:[(0,Ct.jsxs)("p",{children:["\u751F\u6210 ",o," \u9053\u72EC\u7ACB\u5B9E\u8DF5\u9898\u3002\u8BF7\u6838\u5BF9\u6807\u9898\u4E0E\u96BE\u5EA6\uFF1B\u6BCF\u9053\u9898\u90FD\u4FDD\u7559\u72EC\u7ACB\u73AF\u5883\u3001\u9A8C\u8BC1\u548C\u91CD\u8BD5\u8BB0\u5F55\u3002"]}),i.map((s,f)=>(0,Ct.jsxs)("fieldset",{children:[(0,Ct.jsxs)("legend",{children:["\u7B2C ",s.itemIndex," \u9053\u9898"]}),(0,Ct.jsxs)("label",{className:"field",children:["\u9898\u76EE\u6807\u9898",(0,Ct.jsx)("input",{value:s.title,minLength:2,maxLength:80,onChange:p=>u(i.map((d,h)=>h===f?{...d,title:p.target.value}:d))})]}),(0,Ct.jsxs)("label",{className:"field",children:["\u96BE\u5EA6",(0,Ct.jsx)("select",{value:s.difficulty,onChange:p=>u(i.map((d,h)=>h===f?{...d,difficulty:p.target.value}:d)),children:["\u7B80\u5355","\u4E2D\u7B49","\u56F0\u96BE","\u6309\u5F53\u524D\u65B9\u6848"].map(p=>(0,Ct.jsx)("option",{children:p},p))})]})]},s.itemIndex)),(0,Ct.jsx)("p",{className:"quiet",children:"\u751F\u6210\u540E\u4FDD\u5B58\u4E3A\u8349\u7A3F\uFF0C\u5BA1\u9605\u540E\u518D\u53D1\u5E03\u3002"})]}),(0,Ct.jsxs)("div",{className:"dialog-actions",children:[(0,Ct.jsx)(P,{onClick:n,children:"\u8FD4\u56DE\u4FEE\u6539"}),(0,Ct.jsxs)(P,{className:"primary",disabled:l.busy||!c,onClick:()=>void r.run(async()=>{await r.selectOption(a,t.id,{requestedCount:o,independence:"independent_challenges",exerciseMode:"CTF",publishMode:"draft",items:i.map(s=>({...s,title:s.title.trim()}))}),n()}),children:["\u786E\u8BA4\u751F\u6210 ",o," \u9053\u9898"]})]})]})}function Gc(e,t){try{let a=localStorage.getItem(e);return a?JSON.parse(a):t}catch{return t}}function Vc(e,t){try{localStorage.setItem(e,JSON.stringify(t))}catch{}}var Xc=()=>({learningPattern:"",text:"",mode:"auto",delivery:"after-current",sources:[],skills:[],artifactType:"auto"}),jc=class{constructor(t){this.owner=t}name(t,a="draft"){return`aisecedu:workbench:v3:${this.owner}:${t||"new"}:${a}`}draft(t,a=""){let n=Gc(this.name(t),{});return{...Xc(),...n,learningPattern:(n.learningPattern??a)==="process-inquiry"?"process-inquiry":"",mode:"auto",sources:Array.isArray(n.sources)?n.sources:[],skills:Array.isArray(n.skills)?n.skills:[]}}save(t,a){Vc(this.name(t),a)}value(t,a){return Gc(this.name(null,t),a)}set(t,a){Vc(this.name(null,t),a)}};var Je=W(_e(),1);var O0={docx:"Word \u6587\u6863",md:"Markdown",txt:"\u7EAF\u6587\u672C",html:"\u7F51\u9875",csv:"CSV \u8868\u683C",json:"JSON",ipynb:"Jupyter \u7B14\u8BB0\u672C"},Qc=e=>O0[e]||e.toUpperCase();function wh(e){if(!e||typeof e!="object")return;let{id:t,jobId:a,filename:n,format:l,size:r}=e;if(!(typeof t!="string"||!/^file_[a-f0-9]{32}$/.test(t)||typeof a!="string"||!/^[a-z0-9_-]{1,64}$/i.test(a)||typeof n!="string"||!n.trim()||typeof l!="string"||!Object.hasOwn(O0,l)))return{id:t,jobId:a,filename:n,format:l,size:typeof r=="number"&&r>0?r:0}}function sr(e=[]){let t=new Map;for(let a of e){let n=a.metadata?.files;if(Array.isArray(n))for(let l of n){let r=wh(l);r&&t.set(r.id,r)}}return[...t.values()].reverse()}var Ih=e=>`/jobs/${encodeURIComponent(e.jobId)}/files/${encodeURIComponent(e.id)}`,cr=e=>`/pwncollege_api/v1/teaching${Ih(e)}`;function Yc(e){return e>=1024*1024?`${(e/(1024*1024)).toFixed(1)} MB`:`${Math.max(1,Math.round(e/1024))} KB`}var V=W(Le(),1);function Kc({format:e,size:t=21}){let a=e==="csv"?Ri:["json","html","ipynb"].includes(e)?qa:je;return(0,V.jsx)(a,{size:t,"aria-hidden":"true"})}function N0({text:e}){return(0,V.jsx)("div",{className:"markdown",children:(0,V.jsx)(du,{skipHtml:!0,remarkPlugins:[bo],components:{img:({alt:t})=>t?(0,V.jsx)("span",{children:t}):null,a:({children:t})=>(0,V.jsx)("span",{children:t})},children:e})})}function eM(e){if(e instanceof wa){if(e.status===422)return"\u8FD9\u4EFD\u6587\u4EF6\u8D85\u51FA\u5728\u7EBF\u9884\u89C8\u8303\u56F4\uFF0C\u53EF\u4EE5\u4E0B\u8F7D\u539F\u6587\u4EF6\u3002";if(e.status===401||e.status===404)return"\u5F53\u524D\u4F1A\u8BDD\u65E0\u6CD5\u8BFB\u53D6\u8FD9\u4EFD\u6587\u4EF6\u3002"}return"\u6587\u4EF6\u6682\u65F6\u65E0\u6CD5\u9884\u89C8\u3002\u8BF7\u91CD\u8BD5\uFF0C\u6216\u4E0B\u8F7D\u539F\u6587\u4EF6\u3002"}function tM({file:e,number:t}){let[a,n]=(0,Je.useState)(0),[l,r]=(0,Je.useState)(!1);return l?(0,V.jsxs)("div",{className:"preview-page-error",children:[(0,V.jsxs)("p",{children:["\u7B2C ",t," \u9875\u52A0\u8F7D\u5931\u8D25"]}),(0,V.jsx)(P,{onClick:()=>{r(!1),n(o=>o+1)},children:"\u91CD\u8BD5\u6B64\u9875"})]}):(0,V.jsx)("img",{src:`${cr(e)}?view=page&page=${t}&attempt=${a}`,loading:t===1?"eager":"lazy",decoding:"async",alt:`\u7B2C ${t} \u9875`,draggable:!1,onError:()=>r(!0)})}function q0({file:e,expanded:t,onExpand:a,onClose:n}){let{state:l,controller:r}=ue(),o=sr(l.thread?.messages);o.some(E=>E.id===e.id)||o.unshift(e);let[i,u]=(0,Je.useState)(),[c,s]=(0,Je.useState)(0),[f,p]=(0,Je.useState)("fit"),[d,h]=(0,Je.useState)(1),[y,k]=(0,Je.useState)(500),g=(0,Je.useRef)(null),m=(0,Je.useRef)(null),x=(0,Je.useRef)([]),S=(0,Je.useRef)(new Map),I=i?.id===e.id?i.preview:void 0,v=i?.id===e.id?i.error:void 0,T=I?.kind==="pages"?I:void 0,N=T?T.width*4/3:816,U=Math.min(920,Math.max(200,y-(y<460?28:48))),w=f==="fit"?1:Number(f)/100,ne=f==="fit"?U:N*w;(0,Je.useEffect)(()=>{let E=g.current;if(!E)return;let Q=E.getRootNode().activeElement;return E.focus({preventScroll:!0}),()=>{Q instanceof HTMLElement&&Q.isConnected&&Q.focus({preventScroll:!0})}},[]),(0,Je.useEffect)(()=>{let E=m.current;if(!E)return;let O=new ResizeObserver(([Q])=>k(Q.contentRect.width));return O.observe(E),()=>O.disconnect()},[]),(0,Je.useEffect)(()=>{let E=new AbortController;return Re(Ih(e)+"?view=preview",{signal:E.signal}).then(O=>{E.signal.aborted||u({id:e.id,preview:O})}).catch(O=>{E.signal.aborted||u({id:e.id,error:eM(O)})}),()=>E.abort()},[e.id,e.jobId,c]),(0,Je.useLayoutEffect)(()=>{let E=m.current;if(!E||!I)return;let O=S.current.get(e.id);E.scrollTop=O?.top||0,E.scrollLeft=O?.left||0,h(1)},[e.id,I]),(0,Je.useEffect)(()=>{if(!T||!m.current)return;let E=m.current,O=0,Q=()=>{let gt=E.getBoundingClientRect().top+E.clientHeight*.36,St=1;for(let[it,kt]of x.current.slice(0,T.pages).entries())kt&&kt.getBoundingClientRect().top<=gt&&(St=it+1);let L=E.scrollHeight-E.clientHeight;h(L>2&&E.scrollTop>=L-2?T.pages:St)},Ce=()=>{cancelAnimationFrame(O),O=requestAnimationFrame(Q)};return Q(),E.addEventListener("scroll",Ce,{passive:!0}),()=>{cancelAnimationFrame(O),E.removeEventListener("scroll",Ce)}},[T,ne]);let te=E=>{let O=x.current[E-1],Q=m.current;!O||!Q||(Q.scrollTop+=O.getBoundingClientRect().top-Q.getBoundingClientRect().top-12,h(E))},z=E=>{let O=d;p(E),T&&requestAnimationFrame(()=>te(O))};return(0,V.jsxs)("section",{className:"file-preview","aria-label":"\u6587\u4EF6\u9884\u89C8",children:[(0,V.jsxs)("header",{className:"file-preview-toolbar",children:[(0,V.jsxs)("label",{className:"file-preview-picker",title:e.filename,children:[(0,V.jsx)(Kc,{format:e.format,size:19}),(0,V.jsx)("select",{"aria-label":"\u5207\u6362\u9884\u89C8\u6587\u4EF6",ref:g,value:e.id,onChange:E=>{let O=o.find(Q=>Q.id===E.target.value);O&&r.openFile(O)},children:o.map(E=>(0,V.jsx)("option",{value:E.id,children:E.filename},E.id))})]}),(0,V.jsxs)("div",{className:"file-preview-tools",children:[(0,V.jsxs)("select",{className:"file-preview-zoom","aria-label":"\u7F29\u653E\u9884\u89C8",value:f,disabled:!I,onChange:E=>z(E.target.value),children:[(0,V.jsx)("option",{value:"fit",children:"\u9002\u5E94\u5BBD\u5EA6"}),["50","70","100","125","150","200"].map(E=>(0,V.jsxs)("option",{value:E,children:[E,"%"]},E))]}),(0,V.jsx)("a",{className:"button icon-button","aria-label":"\u4E0B\u8F7D\u539F\u6587\u4EF6",title:"\u4E0B\u8F7D\u539F\u6587\u4EF6",href:cr(e),download:e.filename,children:(0,V.jsx)(rl,{size:17})}),(0,V.jsx)(Y,{className:"desktop-only",label:t?"\u6062\u590D\u5206\u680F":"\u5C55\u5F00\u6587\u4EF6\u9884\u89C8",onClick:a,children:t?(0,V.jsx)(Vl,{size:17}):(0,V.jsx)(Gl,{size:17})}),(0,V.jsx)(Y,{label:"\u5173\u95ED\u6587\u4EF6\u9884\u89C8",onClick:n,children:(0,V.jsx)(qe,{size:18})})]})]}),(0,V.jsx)("div",{className:"file-preview-canvas",ref:m,role:"region","aria-label":"\u6587\u4EF6\u5185\u5BB9",tabIndex:0,"aria-busy":!I&&!v,onScroll:E=>{let{scrollTop:O,scrollLeft:Q}=E.currentTarget;I&&S.current.set(e.id,{top:O,left:Q})},children:v?(0,V.jsxs)("div",{className:"file-preview-state",role:"status",children:[(0,V.jsx)(Kc,{format:e.format,size:29}),(0,V.jsx)("p",{children:v}),(0,V.jsxs)(P,{onClick:()=>{u(void 0),s(E=>E+1)},children:[(0,V.jsx)(Ln,{size:15}),"\u91CD\u8BD5\u9884\u89C8"]})]}):I?(0,V.jsx)("div",{className:"file-preview-stack",children:I.kind==="pages"?Array.from({length:I.pages},(E,O)=>(0,V.jsx)("figure",{className:"file-paper",ref:Q=>{x.current[O]=Q},style:{width:ne,aspectRatio:I.width/I.height},children:(0,V.jsx)(tM,{file:e,number:O+1})},O)):I.kind==="html"?(0,V.jsx)("iframe",{className:"file-html-preview",title:e.filename,src:cr(e)+"?view=html",sandbox:"",referrerPolicy:"no-referrer",style:{width:ne/w,zoom:w}}):(0,V.jsxs)("article",{className:"file-reading-sheet",style:{width:ne,fontSize:`${w}rem`},children:[I.truncated&&(0,V.jsx)("p",{className:"file-preview-limit",children:"\u4EC5\u663E\u793A\u90E8\u5206\u5185\u5BB9\uFF0C\u53EF\u4E0B\u8F7D\u539F\u6587\u4EF6\u9605\u8BFB\u5168\u6587\u3002"}),I.kind==="markdown"?(0,V.jsx)(N0,{text:I.text}):I.kind==="table"?(0,V.jsxs)("table",{children:[(0,V.jsx)("thead",{children:(0,V.jsx)("tr",{children:I.rows[0]?.map((E,O)=>(0,V.jsx)("th",{scope:"col",children:E},O))})}),(0,V.jsx)("tbody",{children:I.rows.slice(1).map((E,O)=>(0,V.jsx)("tr",{children:E.map((Q,Ce)=>(0,V.jsx)("td",{children:Q},Ce))},O))})]}):I.kind==="notebook"?I.cells.map((E,O)=>E.kind==="markdown"?(0,V.jsx)(N0,{text:E.source},O):(0,V.jsx)("pre",{children:(0,V.jsx)("code",{children:E.source})},O)):"text"in I&&(0,V.jsx)("pre",{children:I.text})]})},e.id):(0,V.jsxs)("div",{className:"file-preview-state",role:"status",children:[(0,V.jsx)(Dt,{className:"spin",size:22}),"\u6B63\u5728\u51C6\u5907\u9884\u89C8"]})}),(0,V.jsxs)("footer",{className:"file-preview-footer",children:[(0,V.jsxs)("span",{children:[Qc(e.format),e.size>0?` \xB7 ${Yc(e.size)}`:""]}),T&&(0,V.jsxs)("div",{className:"file-page-controls",children:[(0,V.jsx)(Y,{label:"\u4E0A\u4E00\u9875",disabled:d<=1,onClick:()=>te(d-1),children:(0,V.jsx)(Mi,{size:16})}),(0,V.jsxs)("span",{"aria-live":"polite",children:[d," / ",T.pages]}),(0,V.jsx)(Y,{label:"\u4E0B\u4E00\u9875",disabled:d>=T.pages,onClick:()=>te(d+1),children:(0,V.jsx)(Fl,{size:16})})]})]})]})}var C=W(Le(),1);function U0({text:e}){let{controller:t,state:a}=ue();return(0,C.jsx)("div",{className:"markdown",children:(0,C.jsx)(du,{remarkPlugins:[bo],skipHtml:!0,components:{a:({href:n,children:l})=>(0,C.jsx)("a",{href:Lo(n),target:"_blank",rel:"noopener noreferrer",onClick:r=>{if(r.button||r.altKey||r.metaKey||r.ctrlKey||r.shiftKey)return;let o=n&&sr(a.thread?.messages).find(u=>n===cr(u));if(o){r.preventDefault(),t.openFile(o);return}let i=n?.match(/^\/teacher\/artifacts\/([^?#/]+)/);i&&(r.preventDefault(),t.openArtifact(decodeURIComponent(i[1])).catch(t.error))},children:l}),img:({src:n,alt:l})=>(0,C.jsx)("span",{className:"image-link",children:Lo(n)?(0,C.jsx)("a",{href:Lo(n),target:"_blank",rel:"noopener noreferrer",children:l||"\u67E5\u770B\u56FE\u7247"}):l})},children:e})})}function aM({message:e}){let{state:t,controller:a}=ue(),n=`aisecedu:requirements:${t.thread?.id}:${e.id}`,[l,r]=(0,me.useState)(()=>Gc(n,{})),[o,i]=(0,me.useState)(0),[u,c]=(0,me.useState)(!1),s=(0,me.useRef)(null),f=e.metadata.questions||[];if((0,me.useEffect)(()=>{Vc(n,l)},[n,l]),(0,me.useEffect)(()=>{u&&s.current?.focus()},[u]),!f.length||e.metadata.pending)return null;if(e.metadata.questionReplyJobId)return(0,C.jsxs)("span",{className:"question-complete",children:[(0,C.jsx)(Ft,{size:14}),"\u9700\u6C42\u5DF2\u7B54\u590D"]});let p=f[o];if(!p)return null;let d=p.choices||[],h=l[p.id]||"",y=u||!d.length||!!(h&&!d.includes(h)),k=m=>{i(m),c(!1)},g=o===f.length-1;return(0,C.jsxs)("form",{className:"question-block",onSubmit:m=>{if(m.preventDefault(),!h.trim())return;if(!g){k(o+1);return}let x=f.findIndex(S=>!l[S.id]?.trim());if(x>=0){k(x);return}a.send({content:f.map(S=>l[S.id].trim()).join(`
`),questionReply:{sourceMessageId:e.id,answers:l}})},children:[(0,C.jsxs)("header",{className:"question-header",children:[(0,C.jsx)("strong",{children:"\u786E\u8BA4\u6559\u5B66\u9700\u6C42"}),f.length>1&&(0,C.jsxs)("span",{children:[o+1," / ",f.length]})]}),(0,C.jsxs)("fieldset",{children:[(0,C.jsx)("legend",{children:p.text}),d.length>0&&(0,C.jsx)("div",{className:"choice-list",children:d.map((m,x)=>(0,C.jsxs)("button",{className:h===m?"selected":"",type:"button","aria-pressed":h===m,onClick:()=>{r({...l,[p.id]:m}),c(!1)},children:[(0,C.jsx)("span",{className:"choice-indicator","aria-hidden":"true",children:h===m&&(0,C.jsx)(Ft,{size:13})}),(0,C.jsxs)("span",{children:[(0,C.jsx)("strong",{children:m}),p.descriptions?.[x]&&(0,C.jsx)("small",{children:p.descriptions[x]})]})]},m))}),y?(0,C.jsx)("textarea",{ref:s,"aria-label":p.text,placeholder:"\u586B\u5199\u4F60\u7684\u56DE\u7B54",value:d.includes(h)?"":h,onChange:m=>r({...l,[p.id]:m.target.value}),maxLength:750,required:!0,rows:2}):(0,C.jsx)("button",{type:"button",className:"question-custom",onClick:()=>{r({...l,[p.id]:""}),c(!0)},children:"\u81EA\u5DF1\u586B\u5199"})]},p.id),(0,C.jsxs)("footer",{children:[o>0&&(0,C.jsx)("button",{type:"button",className:"button",onClick:()=>k(o-1),children:"\u4E0A\u4E00\u4E2A"}),(0,C.jsx)("button",{type:"submit",className:"button primary",disabled:t.busy||!h.trim(),children:g?"\u63D0\u4EA4\u5E76\u7EE7\u7EED":"\u4E0B\u4E00\u4E2A"})]})]})}function nM({message:e}){let{state:t,controller:a}=ue(),n=e.metadata.generationOptions,[l,r]=(0,me.useState)(0),[o,i]=(0,me.useState)(!1),[u,c]=(0,me.useState)("");if(!n?.options?.length)return null;let s=n.options[Math.min(l,n.options.length-1)],f=e.metadata.generationSelection,p=f?.status==="STARTED",d=!!e.metadata.generationRefinement;return(0,C.jsxs)("section",{className:"options-block",children:[(0,C.jsxs)("header",{children:[(0,C.jsx)(sl,{size:16}),(0,C.jsx)("strong",{children:"\u751F\u6210\u65B9\u6848"}),(0,C.jsx)("span",{className:"quiet",children:"\u5BA1\u9605\u540E\u5F00\u59CB\u5236\u4F5C"})]}),(0,C.jsx)("div",{className:"option-tabs",role:"tablist","aria-label":"\u751F\u6210\u65B9\u6848",children:n.options.map((h,y)=>(0,C.jsxs)("button",{role:"tab","aria-selected":l===y,onClick:()=>r(y),children:["\u65B9\u6848 ",y+1,f?.optionId===h.id&&(0,C.jsx)(Ft,{size:12})]},h.id))}),(0,C.jsxs)("div",{className:"option-content",role:"tabpanel",children:[(0,C.jsx)("h3",{children:s.title}),(0,C.jsx)("p",{children:s.description}),(0,C.jsx)("ul",{children:(s.highlights||[]).map(h=>(0,C.jsx)("li",{children:h},h))}),(0,C.jsxs)("details",{children:[(0,C.jsx)("summary",{children:"\u67E5\u770B\u5B8C\u6574\u751F\u6210\u8981\u6C42"}),(0,C.jsx)(U0,{text:s.rewrittenPrompt||s.prompt||""})]}),(0,C.jsxs)(P,{className:"primary",disabled:t.busy||p||d,onClick:()=>n.artifactType==="ctf-challenge"?i(!0):void a.run(()=>a.selectOption(e.id,s.id)),children:[(0,C.jsx)(bn,{size:14}),p?"\u5DF2\u5F00\u59CB\u751F\u6210":d?"\u5DF2\u6709\u65B0\u65B9\u6848":"\u91C7\u7528\u6B64\u65B9\u6848"]})]}),!p&&!d&&(0,C.jsxs)("details",{className:"refine-options",children:[(0,C.jsx)("summary",{children:"\u8C03\u6574\u65B9\u6848\u8981\u6C42"}),(0,C.jsx)("textarea",{"aria-label":"\u65B9\u6848\u4FEE\u6539\u8981\u6C42",value:u,onChange:h=>c(h.target.value),placeholder:"\u8BF4\u660E\u9700\u8981\u4FDD\u7559\u548C\u8C03\u6574\u7684\u90E8\u5206",rows:2}),(0,C.jsx)(P,{disabled:!u.trim()||t.busy,onClick:()=>void a.run(async()=>{await Re(`/threads/${pe(t.thread.id)}/messages/${e.id}/generation-options/refine`,{method:"POST",key:ur(),body:{content:u}}),await a.refreshThread()}),children:"\u66F4\u65B0\u65B9\u6848"})]}),o&&(0,C.jsx)(R0,{bundle:n,option:s,messageId:e.id,onClose:()=>i(!1)})]})}function lM({message:e}){let{state:t,controller:a}=ue(),n=e.metadata.toolProposals||[];return e.metadata.pending!==!1?null:(0,C.jsx)(C.Fragment,{children:n.map((l,r)=>{if(l.tool==="classroom.prepare"){let u=t.thread;if(!u)return null;let c=Uc(u,e,r),s=t.busy||t.loadingThread;return(0,C.jsxs)("section",{className:"approval-block",children:[(0,C.jsxs)("h3",{children:[(0,C.jsx)(io,{size:17}),"\u51C6\u5907\u8BFE\u5802"]}),(0,C.jsx)("p",{children:l.reason||"\u4F7F\u7528\u5DF2\u53D1\u5E03\u7684\u9759\u6001\u8BFE\u4EF6\u51C6\u5907\u8BFE\u5802\u3002"}),c?c.sessionId?(0,C.jsxs)(C.Fragment,{children:[(0,C.jsx)("p",{role:"status",children:"\u8BFE\u5802\u5DF2\u51C6\u5907\u3002\u5F00\u59CB\u4E0A\u8BFE\u9700\u8981\u6559\u5E08\u786E\u8BA4\u3002"}),(0,C.jsx)("a",{href:I0(u.id,c.sessionId),children:"\u67E5\u770B\u5DF2\u51C6\u5907\u7684\u8BFE\u5802"})]}):c.decision==="REJECTED"?(0,C.jsx)("p",{role:"status",children:"\u5DF2\u62D2\u7EDD\u8BFE\u5802\u51C6\u5907\u3002"}):c.decision==="APPROVED"?(0,C.jsx)(P,{className:"primary",disabled:s,onClick:()=>void a.run(()=>a.prepareClassroom(u.id,e.id,r)),children:"\u7EE7\u7EED\u51C6\u5907\u8BFE\u5802"}):(0,C.jsxs)(C.Fragment,{children:[(0,C.jsxs)("details",{children:[(0,C.jsx)("summary",{children:"\u67E5\u770B\u64CD\u4F5C\u8BE6\u60C5"}),(0,C.jsx)(Sa,{value:{tool:l.tool,arguments:l.arguments}})]}),(0,C.jsxs)("div",{className:"button-row",children:[(0,C.jsx)(P,{disabled:s,onClick:()=>void a.run(()=>a.prepareClassroom(u.id,e.id,r,"REJECTED")),children:"\u62D2\u7EDD"}),(0,C.jsx)(P,{className:"primary",disabled:s,onClick:()=>void a.run(()=>a.prepareClassroom(u.id,e.id,r,"APPROVED")),children:"\u6279\u51C6\u5E76\u51C6\u5907\u8BFE\u5802"})]})]}):(0,C.jsx)("p",{children:"\u8BF7\u8FD4\u56DE\u539F\u8BFE\u7A0B\u548C\u7AE0\u8282\u5E76\u6838\u5BF9\u63D0\u6848\u53CA\u6279\u51C6\u8BB0\u5F55\u3002"})]},r)}let o=e.metadata.toolProposalDecisions?.[String(r)],i=e.metadata.toolExecutionResults?.[String(r)];return!l.requiresConfirmation||o||i?.status==="SUCCEEDED"?null:(0,C.jsxs)("section",{className:"approval-block",children:[(0,C.jsxs)("h3",{children:[(0,C.jsx)(io,{size:17}),"\u9700\u8981\u4F60\u6279\u51C6"]}),(0,C.jsx)("p",{children:l.reason||l.tool}),(0,C.jsxs)("details",{children:[(0,C.jsx)("summary",{children:"\u67E5\u770B\u64CD\u4F5C\u8BE6\u60C5"}),(0,C.jsx)(Sa,{value:{tool:l.tool,arguments:l.arguments}})]}),(0,C.jsxs)("div",{className:"button-row",children:[(0,C.jsx)(P,{disabled:t.busy,onClick:()=>void a.run(()=>a.approve(e.id,r,"REJECTED")),children:"\u62D2\u7EDD"}),(0,C.jsx)(P,{className:"primary",disabled:t.busy,onClick:()=>void a.run(()=>a.approve(e.id,r,"APPROVED")),children:"\u6279\u51C6\u5E76\u7EE7\u7EED"})]})]},r)})})}function rM({message:e,jobId:t,readText:a,speech:n}){let{state:l,controller:r}=ue(),[o,i]=(0,me.useState)(!1),[u,c]=(0,me.useState)(!1),s=(0,me.useRef)(null),f=(0,me.useRef)(null),p=e.metadata||{},d=p.replyFeedback,h=n.speakingId===e.id,y=!p.failed&&!["FAILED","CANCELED"].includes(p.jobStatus),k=`reply-more-${e.id}`,g=async m=>{if(!(!l.thread||o)){i(!0);try{await r.setReplyFeedback(l.thread.id,e.id,d===m?null:m)}catch(x){r.error(x)}finally{i(!1)}}};return(0,me.useEffect)(()=>{if(!u)return;let m=x=>{s.current&&!x.composedPath().includes(s.current)&&c(!1)};return document.addEventListener("pointerdown",m,!0),document.addEventListener("focusin",m,!0),()=>{document.removeEventListener("pointerdown",m,!0),document.removeEventListener("focusin",m,!0)}},[u]),(0,C.jsxs)(C.Fragment,{children:[(0,C.jsx)(Y,{label:"\u6709\u5E2E\u52A9","aria-pressed":d==="positive",disabled:o,onClick:()=>void g("positive"),children:(0,C.jsx)(Vi,{size:15})}),(0,C.jsx)(Y,{label:"\u9700\u6539\u8FDB","aria-pressed":d==="negative",disabled:o,onClick:()=>void g("negative"),children:(0,C.jsx)(Gi,{size:15})}),a&&(0,C.jsx)(Y,{label:h?"\u505C\u6B62\u6717\u8BFB":"\u6717\u8BFB\u56DE\u590D",title:n.supported?h?"\u505C\u6B62\u6717\u8BFB":"\u6717\u8BFB\u56DE\u590D":"\u6B64\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u6717\u8BFB",disabled:!n.supported,onClick:()=>n.toggle(e.id,a()),children:h?(0,C.jsx)(vn,{size:14}):(0,C.jsx)(ji,{size:15})}),(y||t)&&(0,C.jsxs)("div",{className:"reply-more",ref:s,onKeyDown:m=>{m.key!=="Escape"||!u||(m.preventDefault(),c(!1),f.current?.focus())},children:[(0,C.jsx)("button",{type:"button",className:"button icon-button","aria-label":"\u66F4\u591A\u56DE\u590D\u64CD\u4F5C",title:"\u66F4\u591A\u56DE\u590D\u64CD\u4F5C",ref:f,"aria-expanded":u,"aria-controls":u?k:void 0,onClick:()=>c(m=>!m),children:(0,C.jsx)(Na,{size:16})}),u&&(0,C.jsxs)("div",{className:"reply-menu",id:k,role:"group","aria-label":"\u66F4\u591A\u56DE\u590D\u64CD\u4F5C",children:[y&&(0,C.jsxs)(P,{disabled:l.busy,onClick:()=>{c(!1);let m=l.thread?.id;m&&r.run(()=>r.fork(m,e.id))},children:[(0,C.jsx)(hn,{size:14}),"\u4ECE\u6B64\u56DE\u590D\u521B\u5EFA\u5206\u652F"]}),t&&(0,C.jsxs)(P,{onClick:()=>{c(!1),f.current?.focus(),r.selectJob(t)},children:[(0,C.jsx)(Ut,{size:14}),"\u67E5\u770B\u6267\u884C\u8BB0\u5F55"]})]})]})]})}function oM({message:e,onResent:t,speech:a}){let{state:n,controller:l}=ue(),[r,o]=(0,me.useState)(!1),[i,u]=(0,me.useState)(!1),[c,s]=(0,me.useState)(null),[f,p]=(0,me.useState)(""),[d,h]=(0,me.useState)(!1),y=(0,me.useRef)(null),k=(0,me.useRef)(null),g=(0,me.useRef)(null),m=c!==null;(0,me.useEffect)(()=>{m&&k.current?.focus({preventScroll:!0})},[m]);let[x,S]=(0,me.useState)(null),I=e.metadata||{},v=n.jobs.find(b=>b.id===I.jobId),T=(0,me.useMemo)(()=>v?qc(v.id,n.events[v.id]||[],et(v)):[],[v?.id,v?.status,n.events]),N=T.filter(b=>b.kind==="message").map(b=>w0(b.content||"")).filter(Boolean).at(-1),U=Array.isArray(I.plan)?I.plan:[],w=I.pending===!0,ne=!!(I.questions?.length&&!I.questionReplyJobId&&!w),te=w&&N?N:w?"":e.content,z=document.getElementById("cocreation-workbench")?.dataset.scopedTeaching==="true",E=I.questions?.length&&te==="\u6211\u9700\u8981\u786E\u8BA4\u4E00\u4E2A\u4F1A\u5F71\u54CD\u6210\u54C1\u7684\u9009\u62E9\u3002"?"":z&&e.role==="assistant"?_c(te):te,O=[...T].reverse().find(b=>b.kind!=="message"&&b.kind!=="reasoning"),Q=e.role==="user",Ce=mu(v&&et(v)?v.completed:void 0)||mu(e.created),gt=Ce&&(0,C.jsx)("time",{dateTime:Ce.toISOString(),title:Sh(Ce),children:M0(Ce)}),St=Q&&n.thread?.status==="ACTIVE"&&!I.hidden&&!!e.content.trim(),L=!!(c?.content.trim()&&c.content.trim()!==e.content.trim()),it=()=>{s(null),requestAnimationFrame(()=>g.current?.focus({preventScroll:!0}))},kt=async()=>{let b=n.thread;if(!(!b||!c||!L||d)){h(!0),p("");try{await l.replaceMessage(b.id,e.id,c.content.trim(),c.last),s(null),t()}catch(ae){p(ae instanceof wa?ae.message:"\u6D88\u606F\u6682\u65F6\u65E0\u6CD5\u91CD\u53D1\uFF0C\u8BF7\u91CD\u8BD5\u3002")}finally{h(!1)}}};return(0,C.jsxs)("article",{className:`message ${Q?"user-message":"assistant-message"}`,"data-message-id":e.id,"data-editing":m||void 0,"data-show-actions":i||void 0,"aria-label":Q?"\u4F60\u7684\u6D88\u606F":"\u7384\u7532\u56DE\u590D",children:[(0,C.jsxs)("div",{className:"message-body",ref:y,onPointerUp:b=>{!m&&b.pointerType==="touch"&&b.target instanceof Element&&!b.target.closest("a,button,input,textarea,summary")&&u(ae=>!ae)},children:[U.length>0&&(0,C.jsxs)("details",{className:"plan-block",open:w||I.executionMode==="plan",children:[(0,C.jsxs)("summary",{children:[(0,C.jsx)(sl,{size:15}),"\u4EFB\u52A1\u8BA1\u5212",(0,C.jsxs)("span",{children:[U.length," \u9879"]})]}),(0,C.jsx)("ol",{children:U.map((b,ae)=>(0,C.jsx)("li",{children:typeof b=="string"?b:b.title||b.description||b.step||JSON.stringify(b)},ae))})]}),v&&(w||ne||v.status==="FAILED"||v.status==="CANCELED")&&(0,C.jsxs)("button",{className:"run-summary",onClick:()=>l.selectJob(v.id),children:[(0,C.jsx)($t,{status:ne?"WAITING_INPUT":v.status}),!ne&&(0,C.jsx)("span",{children:O?.title||v.message||v.stage||"\u67E5\u770B\u6267\u884C\u8BB0\u5F55"}),(0,C.jsx)(fa,{size:14})]}),c?(0,C.jsxs)("form",{className:"message-editor",onSubmit:b=>{b.preventDefault(),kt()},onKeyDown:b=>{b.nativeEvent.isComposing||(b.key==="Escape"&&!d&&(b.preventDefault(),it()),b.key==="Enter"&&(b.ctrlKey||b.metaKey)&&(b.preventDefault(),kt()))},children:[(0,C.jsx)("textarea",{ref:k,"aria-label":"\u7F16\u8F91\u6D88\u606F",value:c.content,maxLength:16e3,disabled:d,rows:Math.max(3,Math.min(9,c.content.split(`
`).length+1)),onChange:b=>s({...c,content:b.target.value})}),(0,C.jsx)("p",{className:"message-editor-note",children:"\u91CD\u53D1\u4F1A\u66FF\u6362\u8FD9\u6761\u6D88\u606F\u53CA\u4E4B\u540E\u7684\u5BF9\u8BDD\u3002"}),f&&(0,C.jsx)("p",{className:"message-editor-error",role:"alert",children:f}),(0,C.jsxs)("div",{className:"message-editor-actions",children:[(0,C.jsx)(P,{type:"button",disabled:d,onClick:it,children:"\u53D6\u6D88"}),(0,C.jsx)(P,{type:"submit",className:"primary",disabled:!L||d,children:d?"\u6B63\u5728\u91CD\u53D1":"\u91CD\u53D1"})]})]}):E&&(0,C.jsx)(U0,{text:E}),w&&!v&&(0,C.jsx)("p",{className:"quiet pending-text",role:"status",children:"\u6B63\u5728\u63A5\u6536\u8981\u6C42\u2026"}),I.executionMode==="plan"&&!w&&!I.failed&&!I.questions?.length&&(0,C.jsxs)(P,{className:"primary",disabled:n.busy,onClick:()=>void l.send({content:"\u6309\u8FD9\u4EFD\u8BA1\u5212\u6267\u884C\u3002",planSourceMessageId:e.id}),children:[(0,C.jsx)(bn,{size:14}),"\u6309\u6B64\u8BA1\u5212\u5236\u4F5C"]}),(0,C.jsx)(aM,{message:e}),(0,C.jsx)(nM,{message:e}),(0,C.jsx)(lM,{message:e}),(e.cards||[]).map(b=>{let ae=b.type==="artifact"||b.objectType==="artifact"?b.objectId:null,xt=b.type==="candidate-set"||b.objectType==="candidate-set"||b.objectType==="candidate_set"?b.objectId:null,xa=b.type==="job"||b.objectType==="job"?b.objectId:null,Tn=Lo(b.state?.href);return(0,C.jsxs)("button",{className:"result-card",disabled:!ae&&!xt&&!xa&&!Tn,onClick:()=>ae?void l.openArtifact(ae).catch(l.error):xt?S(xt):xa?l.selectJob(xa):Tn&&window.open(Tn,"_blank","noopener"),children:[(0,C.jsx)("span",{className:"result-glyph","aria-hidden":"true",children:b.state?.artifactType==="simulation"?(0,C.jsx)(bn,{size:18}):(0,C.jsx)(je,{size:19})}),(0,C.jsxs)("span",{children:[(0,C.jsx)("small",{children:ae?b.state?.artifactType==="simulation"?"\u52A8\u6001\u4EFF\u771F":b.state?.artifactType==="slide-deck"?"\u8BFE\u4EF6":"\u751F\u6210\u6210\u54C1":xt?b.state?.kind==="slide-deck"?"\u8BFE\u4EF6\u65B9\u6848":"\u751F\u6210\u7ED3\u679C":b.title||"\u4EFB\u52A1\u7ED3\u679C"}),(0,C.jsx)("strong",{children:b.title||b.state?.title||"\u67E5\u770B\u5185\u5BB9"}),(0,C.jsx)("span",{children:b.subtitle||(ae&&b.state?.status==="READY"?"\u6253\u5F00\u9884\u89C8":b.state?.status||"")})]}),(0,C.jsx)(fa,{size:16})]},b.id||b.objectId)}),(I.files||[]).map(b=>{let ae=wh(b);if(!ae){let xa=Lo(b.downloadUrl);return xa&&(0,C.jsxs)("a",{className:"file-result",href:xa,download:b.filename,children:[(0,C.jsx)(rl,{size:16}),b.filename]},b.id||xa)}let xt=n.panel==="files"&&n.panelOpen&&n.selectedFile?.id===ae.id;return(0,C.jsxs)("div",{className:"conversation-file","data-active":xt,children:[(0,C.jsxs)("button",{type:"button",className:"conversation-file-open","aria-label":`\u9884\u89C8 ${ae.filename}`,"aria-expanded":xt,"aria-controls":xt?"workbench-file-preview":void 0,onClick:()=>l.openFile(ae),children:[(0,C.jsx)("span",{className:"conversation-file-icon",children:(0,C.jsx)(Kc,{format:ae.format})}),(0,C.jsxs)("span",{className:"conversation-file-name",children:[(0,C.jsx)("strong",{title:ae.filename,children:ae.filename}),(0,C.jsxs)("small",{children:[Qc(ae.format),ae.size>0?` \xB7 ${Yc(ae.size)}`:""]})]})]}),(0,C.jsx)("a",{className:"button icon-button",href:cr(ae),download:ae.filename,"aria-label":`\u4E0B\u8F7D ${ae.filename}`,title:"\u4E0B\u8F7D\u539F\u6587\u4EF6",children:(0,C.jsx)(rl,{size:16})})]},ae.id)}),!w&&(0,C.jsxs)("div",{className:"message-actions",hidden:m,role:"group","aria-label":Q?"\u6D88\u606F\u64CD\u4F5C":"\u56DE\u590D\u64CD\u4F5C",children:[Q&&gt,(0,C.jsx)(Y,{label:r?"\u5DF2\u590D\u5236":"\u590D\u5236\u6D88\u606F",onClick:()=>{navigator.clipboard.writeText(E).then(()=>{o(!0),setTimeout(()=>o(!1),1600)}).catch(l.error)},children:r?(0,C.jsx)(Ft,{size:14}):(0,C.jsx)(Pl,{size:14})}),St&&(0,C.jsx)(Y,{label:"\u7F16\u8F91\u5E76\u91CD\u53D1\u6D88\u606F",onClick:b=>{g.current=b.currentTarget;let ae=n.thread?.messages?.at(-1)?.id;ae!==void 0&&(p(""),s({content:e.content,last:ae}))},children:(0,C.jsx)(yn,{size:14})}),!Q&&(0,C.jsxs)(C.Fragment,{children:[(0,C.jsx)(rM,{message:e,jobId:v?.id,speech:a,readText:E?()=>y.current?.querySelector(":scope > .markdown")?.innerText||"":void 0}),gt]})]})]}),x&&(0,C.jsx)(Fc,{candidateSetId:x,close:()=>S(null)})]})}function iM(){let{state:e,controller:t}=ue(),a=[{title:"\u4EA4\u4E92\u6F14\u793A",subtitle:"\u8BA9\u5B66\u751F\u64CD\u4F5C\u3001\u51B3\u7B56\u4E0E\u89C2\u5BDF",icon:Xl,type:"simulation",prompt:"\u5236\u4F5C\u4E00\u4E2A\u53EF\u4EE5\u76F4\u63A5\u7528\u4E8E\u8BFE\u5802\u7684\u4EA4\u4E92\u6F14\u793A\u3002\u5B66\u751F\u9700\u8981\u901A\u8FC7\u8C03\u6574\u53C2\u6570\u3001\u505A\u51FA\u51B3\u7B56\u5E76\u89C2\u5BDF\u540E\u679C\u6765\u638C\u63E1\u77E5\u8BC6\u3002\u4E3B\u9898\uFF1A"},{title:"\u6559\u5B66\u8BFE\u4EF6",subtitle:"\u5185\u5BB9\u3001\u8BB2\u7A3F\u4E0E\u8BFE\u5802\u4E92\u52A8",icon:je,type:"slide-deck",prompt:"\u5E2E\u6211\u5236\u4F5C\u4E00\u4EFD\u53EF\u4EE5\u76F4\u63A5\u6388\u8BFE\u7684\u8BFE\u4EF6\uFF0C\u5305\u542B\u8BB2\u7A3F\u4E0E\u8BFE\u5802\u4E92\u52A8\u3002\u4E3B\u9898\uFF1A"},{title:"CTF \u5B9E\u8DF5\u9898",subtitle:"\u72EC\u7ACB\u73AF\u5883\u4E0E\u771F\u5B9E\u7EC3\u4E60",icon:Ql,type:"auto",prompt:"\u8BBE\u8BA1\u4E00\u7EC4 CTF \u5B9E\u8DF5\u9898\uFF0C\u5305\u542B\u53EF\u8FD0\u884C\u73AF\u5883\u3001\u5206\u5C42\u63D0\u793A\u548C\u9A8C\u8BC1\u3002\u4E3B\u9898\uFF1A"}],n=document.getElementById("cocreation-workbench")?.dataset.scopedTeaching==="true",l=n?Hc(e)?hu.map((r,o)=>({...r,type:"auto",icon:[da,Xl,je][o]})):[{title:"\u6559\u6848\u4E0E\u8BB2\u4E49",subtitle:"\u751F\u6210\u53EF\u4E0B\u8F7D\u7684 Word \u8349\u7A3F",icon:je,type:"auto",prompt:"\u8BF7\u751F\u6210\u4E00\u4EFD Word \u6559\u6848\uFF0C\u5305\u542B\u6559\u5B66\u76EE\u6807\u3001\u8BFE\u5802\u6D3B\u52A8\u548C\u5C0F\u7ED3\u3002\u4E3B\u9898\uFF1A"},{title:"\u8BFE\u5802\u7EC3\u4E60",subtitle:"\u7F16\u5199\u9898\u76EE\u3001\u7B54\u6848\u548C\u8BB2\u89E3",icon:Xl,type:"auto",prompt:"\u8BF7\u751F\u6210\u4E00\u4EFD Markdown \u8BFE\u5802\u7EC3\u4E60\u6587\u6863\uFF0C\u5305\u542B\u4E09\u9053\u9898\u3001\u53C2\u8003\u7B54\u6848\u548C\u8BB2\u89E3\u3002\u4E3B\u9898\uFF1A"},{title:"\u8BFE\u4EF6\u63D0\u7EB2",subtitle:"\u7EC4\u7EC7\u5404\u9875\u91CD\u70B9\u548C\u8BB2\u6388\u987A\u5E8F",icon:da,type:"auto",prompt:"\u8BF7\u5236\u4F5C\u4E00\u4EFD Word \u6559\u5B66\u8BB2\u4E49\uFF0C\u6309\u4E94\u5F20\u5E7B\u706F\u7247\u7684\u987A\u5E8F\u7F16\u6392\u6807\u9898\u3001\u8981\u70B9\u548C\u8BB2\u89E3\u63D0\u793A\u3002\u4E3B\u9898\uFF1A"}]:a;return(0,C.jsxs)("div",{className:"conversation",children:[(0,C.jsx)("div",{className:"transcript-scroll",children:(0,C.jsxs)("div",{className:"welcome",children:[(0,C.jsxs)("div",{className:"welcome-heading",children:[(0,C.jsx)("span",{className:"welcome-symbol",children:(0,C.jsx)(Ca,{size:24})}),(0,C.jsx)("h1",{children:"\u4ECA\u5929\uFF0C\u4E00\u8D77\u505A\u51FA\u4EC0\u4E48\uFF1F"}),(0,C.jsx)("p",{children:"\u4ECE\u4E00\u4E2A\u6559\u5B66\u60F3\u6CD5\uFF0C\u5230\u53EF\u4EE5\u76F4\u63A5\u4F7F\u7528\u7684\u8BFE\u5802\u6210\u54C1\u3002"})]}),(0,C.jsx)("div",{className:"starter-grid",children:l.map(r=>(0,C.jsxs)(P,{onClick:()=>{t.setDraft({text:r.prompt,artifactType:r.type,...n?{learningPattern:""}:{}}),window.dispatchEvent(new Event("workbench-focus-composer"))},children:[(0,C.jsx)(r.icon,{size:18}),(0,C.jsxs)("span",{children:[(0,C.jsx)("strong",{children:r.title}),(0,C.jsx)("small",{children:r.subtitle})]})]},r.title))}),(0,C.jsxs)("section",{className:"recent-work",children:[(0,C.jsxs)("header",{children:[(0,C.jsx)("h2",{children:"\u7EE7\u7EED\u521B\u4F5C"}),(0,C.jsxs)(P,{onClick:()=>t.setPanel("artifacts"),children:["\u5168\u90E8\u6210\u54C1",(0,C.jsx)(fa,{size:13})]})]}),e.artifacts.slice(0,4).map(r=>(0,C.jsxs)("button",{onClick:()=>void t.openArtifact(r.id).catch(t.error),children:[(0,C.jsx)(je,{size:16}),(0,C.jsx)("strong",{children:r.title}),(0,C.jsxs)("span",{children:["V",r.currentRevision]}),(0,C.jsx)("small",{children:Cn(r.updated)}),(0,C.jsx)(fa,{size:14})]},r.id)),!e.artifacts.length&&(0,C.jsx)("p",{className:"quiet",children:"\u751F\u6210\u7684\u8BFE\u4EF6\u3001\u6F14\u793A\u548C\u9898\u76EE\u4F1A\u4FDD\u5B58\u5728\u8FD9\u91CC\uFF0C\u968F\u65F6\u7EE7\u7EED\u4FEE\u6539\u3002"})]})]})}),(0,C.jsx)(kh,{welcome:!0})]})}function F0(){let{state:e,controller:t}=ue(),a=A0(e.thread?.id,t.error),n=(0,me.useRef)(null),l=(0,me.useRef)(null),r=(0,me.useRef)(!0),[o,i]=(0,me.useState)(!1),u=e.thread?.messages||[],c=u.filter(k=>!k.metadata?.hidden),s=c.some(k=>k.id===a.speakingId);(0,me.useEffect)(()=>{a.speakingId!==null&&!s&&a.stop()},[s,a.speakingId,a.stop]);let f,p,d=new Map(e.jobs.map(k=>[k.id,k.completed])),h=c.map(k=>{let g=mu(k.created),m=g&&D0(g,f,p)?g:void 0;return g&&(f=g,p=k.role==="assistant"?mu(d.get(k.metadata?.jobId)):void 0),{message:k,divider:m}}),y=()=>{r.current=!0,i(!1),l.current?.scrollIntoView({block:"end"})};return(0,me.useEffect)(()=>{r.current&&l.current?.scrollIntoView({block:"end"})},[u,e.events]),(0,me.useEffect)(()=>{r.current=!0,i(!1),l.current?.scrollIntoView({block:"end"})},[e.thread?.id]),!e.thread||!u.length?(0,C.jsx)(iM,{}):(0,C.jsxs)("div",{className:"conversation",children:[(0,C.jsx)("div",{ref:n,className:"transcript-scroll",onScroll:()=>{let k=n.current;r.current=k.scrollHeight-k.scrollTop-k.clientHeight<140,i(!r.current)},children:(0,C.jsxs)("div",{className:"transcript",children:[h.map(({message:k,divider:g})=>(0,C.jsxs)("div",{children:[g&&(0,C.jsx)("div",{className:"conversation-time-divider",children:(0,C.jsx)("time",{dateTime:g.toISOString(),children:Sh(g)})}),(0,C.jsx)(oM,{message:k,onResent:y,speech:a})]},k.id)),(0,C.jsx)("div",{ref:l})]})}),o&&(0,C.jsxs)(P,{className:"jump-latest",onClick:()=>{r.current=!0,l.current?.scrollIntoView({behavior:"smooth",block:"end"})},children:[(0,C.jsx)(Ai,{size:14}),"\u56DE\u5230\u6700\u65B0"]}),(0,C.jsx)(kh,{})]})}var Zc=W(_e(),1);var ie=W(Le(),1);function P0(){let{state:e,controller:t}=ue(),[a,n]=(0,Zc.useState)("all"),[l,r]=(0,Zc.useState)(""),[o,i]=(0,Zc.useState)(null),u=e.jobs.filter(c=>(!l||`${c.title||""} ${c.kind} ${c.id}`.toLowerCase().includes(l.toLowerCase()))&&(a==="all"||a==="running"&&!et(c)||a==="failed"&&["FAILED","CANCELED"].includes(c.status)||a==="done"&&c.status==="SUCCEEDED"));return(0,ie.jsxs)("section",{className:"task-center",children:[(0,ie.jsxs)("header",{children:[(0,ie.jsxs)("div",{children:[(0,ie.jsx)(Ua,{size:23}),(0,ie.jsx)("h1",{children:"\u4EFB\u52A1\u4E2D\u5FC3"})]}),(0,ie.jsx)("p",{children:"\u4EFB\u52A1\u5728\u540E\u53F0\u6301\u7EED\u6267\u884C\u3002\u53EF\u4EE5\u67E5\u770B\u8BB0\u5F55\u3001\u8865\u5145\u8981\u6C42\u6216\u4ECE\u4FDD\u7559\u7ED3\u679C\u7EE7\u7EED\u3002"})]}),(0,ie.jsxs)("div",{className:"task-filters",children:[(0,ie.jsx)("div",{className:"segmented",children:[["all","\u5168\u90E8"],["running","\u8FDB\u884C\u4E2D"],["failed","\u9700\u5904\u7406"],["done","\u5DF2\u5B8C\u6210"]].map(([c,s])=>(0,ie.jsx)("button",{"aria-pressed":a===c,onClick:()=>n(c),children:s},c))}),(0,ie.jsxs)("label",{className:"search-field",children:[(0,ie.jsx)(pa,{size:14}),(0,ie.jsx)("input",{"aria-label":"\u641C\u7D22\u4EFB\u52A1",placeholder:"\u641C\u7D22\u4EFB\u52A1\u2026",value:l,onChange:c=>r(c.target.value)})]})]}),(0,ie.jsxs)("div",{className:"task-list",children:[u.map(c=>(0,ie.jsxs)("article",{className:"task-row",children:[(0,ie.jsx)("div",{className:"task-icon",children:(0,ie.jsx)(Ut,{size:18})}),(0,ie.jsxs)("div",{className:"task-info",children:[(0,ie.jsx)("strong",{children:c.title||Yi[c.kind]||c.kind}),(0,ie.jsx)("p",{children:c.message||c.stage||"\u5DF2\u4FDD\u5B58\u6267\u884C\u8BB0\u5F55"}),(0,ie.jsxs)("small",{children:[Cn(c.created)," ",c.id.slice(0,8)]}),c.error&&(0,ie.jsxs)("details",{children:[(0,ie.jsx)("summary",{children:"\u67E5\u770B\u5931\u8D25\u539F\u56E0"}),(0,ie.jsx)("pre",{children:typeof c.error=="string"?c.error:JSON.stringify(c.error,null,2)})]})]}),(0,ie.jsx)($t,{status:c.status}),(0,ie.jsxs)("div",{className:"task-actions",children:[c.status==="SUCCEEDED"&&c.kind==="candidate.generate"&&c.artifactType==="debate"&&c.resultTarget?.kind==="candidate"&&c.resultTarget.candidateSetId&&(0,ie.jsx)(P,{onClick:()=>i(c.resultTarget.candidateSetId),children:"\u67E5\u770B\u8FA9\u8BBA\u5019\u9009"}),(0,ie.jsx)(Y,{label:"\u67E5\u770B\u6267\u884C\u8FC7\u7A0B",onClick:()=>t.selectJob(c.id),children:(0,ie.jsx)(Ut,{size:15})}),c.threadId&&(0,ie.jsx)(Y,{label:"\u56DE\u5230\u4EFB\u52A1\u4F1A\u8BDD",onClick:()=>void t.activate(c.threadId).catch(t.error),children:(0,ie.jsx)(gn,{size:15})}),["FAILED","CANCELED"].includes(c.status)&&(0,ie.jsxs)(P,{disabled:e.busy,onClick:()=>void t.run(()=>t.retry(c.id)),children:[(0,ie.jsx)(Ln,{size:14}),"\u7EE7\u7EED"]}),!et(c)&&(0,ie.jsx)(Y,{label:"\u505C\u6B62\u4EFB\u52A1",disabled:e.busy,onClick:()=>void t.run(()=>t.cancel(c.id)),children:(0,ie.jsx)(vn,{size:14})})]})]},c.id)),!u.length&&(0,ie.jsx)(Pa,{icon:(0,ie.jsx)(Ua,{size:28}),title:"\u8FD9\u91CC\u6CA1\u6709\u5339\u914D\u7684\u4EFB\u52A1",children:(0,ie.jsx)("p",{children:"\u63D0\u4EA4\u521B\u4F5C\u8981\u6C42\u540E\uFF0C\u4EFB\u52A1\u548C\u6267\u884C\u72B6\u6001\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\u3002"})})]}),(0,ie.jsxs)("p",{className:"quiet task-limit",children:["\u663E\u793A\u6700\u8FD1 ",e.jobs.length," \u9879\u4EFB\u52A1"]}),o&&(0,ie.jsx)(Fc,{candidateSetId:o,close:()=>i(null)},o)]})}var gu=W(_e(),1);var _=W(Le(),1);function uM(){let{state:e,controller:t}=ue(),[a,n]=(0,gu.useState)(""),l=()=>t.patch({modal:null}),r=[{label:"\u65B0\u5EFA\u4F1A\u8BDD",shortcut:"Alt N",icon:bt,action:()=>t.newThread()},{label:"\u6253\u5F00\u4EFB\u52A1\u4E2D\u5FC3",shortcut:"",icon:Ua,action:()=>t.patch({taskCenter:!0})},{label:"\u5207\u6362\u53F3\u4FA7\u5DE5\u4F5C\u533A",shortcut:"\u2318 \u21E7 \\",icon:jl,action:()=>t.togglePanel()},{label:"\u5916\u89C2\u4E0E\u8BBE\u7F6E",shortcut:"",icon:Hi,action:()=>t.patch({modal:"settings"})}],o=i=>i.toLowerCase().includes(a.toLowerCase());return(0,_.jsxs)(ma,{title:"\u641C\u7D22\u4E0E\u547D\u4EE4",onClose:l,children:[(0,_.jsxs)("label",{className:"command-search",children:[(0,_.jsx)(pa,{size:18}),(0,_.jsx)("input",{autoFocus:!0,"aria-label":"\u641C\u7D22\u4F1A\u8BDD\u6216\u547D\u4EE4",placeholder:"\u641C\u7D22\u4F1A\u8BDD\u3001\u6210\u54C1\u6216\u64CD\u4F5C\u2026",value:a,onChange:i=>n(i.target.value)})]}),(0,_.jsxs)("div",{className:"command-results",children:[(0,_.jsx)("h3",{children:"\u64CD\u4F5C"}),r.filter(i=>o(i.label)).map(i=>(0,_.jsxs)(P,{onClick:()=>{l(),i.action()},children:[(0,_.jsx)(i.icon,{size:16}),i.label,(0,_.jsx)("kbd",{children:i.shortcut})]},i.label)),(0,_.jsx)("h3",{children:"\u4F1A\u8BDD"}),e.threads.filter(i=>o(i.title+" "+(i.latestMessage||""))).slice(0,12).map(i=>(0,_.jsxs)(P,{onClick:()=>{l(),t.activate(i.id).catch(t.error)},children:[(0,_.jsx)(gn,{size:16}),(0,_.jsx)("span",{children:i.title})]},i.id)),a&&(0,_.jsx)(P,{onClick:()=>{t.filterThreads(a),l(),t.patch({sidebarOpen:!0})},children:"\u641C\u7D22\u6240\u6709\u4F1A\u8BDD\u7684\u5B8C\u6574\u5185\u5BB9"}),(0,_.jsx)("h3",{children:"\u6210\u54C1"}),e.artifacts.filter(i=>o(i.title)).slice(0,8).map(i=>(0,_.jsxs)(P,{onClick:()=>{l(),t.openArtifact(i.id).catch(t.error)},children:[(0,_.jsx)(je,{size:16}),(0,_.jsx)("span",{children:i.title})]},i.id))]})]})}function sM({kind:e}){let{state:t,controller:a}=ue(),[n,l]=(0,gu.useState)(""),r=e==="sources"?t.materials:t.skills,o=new Set(e==="sources"?t.draft.sources.map(i=>i.id):t.draft.skills);return(0,_.jsxs)(ma,{title:e==="sources"?"\u5F15\u7528\u8D44\u6599\u5E93":"\u9009\u62E9\u6280\u80FD",onClose:()=>a.patch({modal:null}),children:[(0,_.jsxs)("label",{className:"command-search",children:[(0,_.jsx)(pa,{size:17}),(0,_.jsx)("input",{autoFocus:!0,"aria-label":"\u641C\u7D22\u8D44\u6599\u6216\u6280\u80FD",placeholder:"\u641C\u7D22\u2026",value:n,onChange:i=>l(i.target.value)})]}),(0,_.jsxs)("div",{className:"catalog-list",children:[r.filter(i=>`${i.name||i.title||i.filename||""} ${i.description||""}`.toLowerCase().includes(n.toLowerCase())).map(i=>{let u=String(e==="sources"?i.id:i.name),c=i.name||i.title||i.filename||u;return(0,_.jsxs)("button",{className:`catalog-item ${o.has(u)?"selected":""}`,"aria-pressed":o.has(u),onClick:()=>{e==="sources"?a.setDraft({sources:o.has(u)?t.draft.sources.filter(s=>s.id!==u):[...t.draft.sources,{id:u,name:c,type:"material"}]}):a.setDraft({skills:o.has(u)?t.draft.skills.filter(s=>s!==u):[...t.draft.skills,u]})},children:[e==="sources"?(0,_.jsx)(Oa,{size:18}):(0,_.jsx)(Pt,{size:18}),(0,_.jsxs)("span",{children:[(0,_.jsx)("strong",{children:c}),(0,_.jsx)("small",{children:i.description||i.status||i.mimeType})]}),(0,_.jsx)("span",{className:"check-box",children:o.has(u)&&(0,_.jsx)(Ft,{size:13})})]},u)}),!r.length&&(0,_.jsxs)(Pa,{title:e==="sources"?"\u8FD8\u6CA1\u6709\u53EF\u5F15\u7528\u7684\u8D44\u6599":"\u6B63\u5728\u8BFB\u53D6\u6280\u80FD\u76EE\u5F55",children:[(0,_.jsx)("p",{children:e==="sources"?"\u53EF\u4EE5\u5728\u8F93\u5165\u533A\u4E0A\u4F20\u6587\u6863\uFF0C\u6216\u5230\u8D44\u6599\u5E93\u6DFB\u52A0\u3002":"\u76EE\u5F55\u4E0D\u53EF\u7528\u65F6\uFF0C\u53EF\u4EE5\u91CD\u8BD5\u8BFB\u53D6\u3002"}),(0,_.jsx)(P,{onClick:()=>void a.loadCatalog(e,!0).catch(a.error),children:"\u91CD\u65B0\u8BFB\u53D6"})]})]}),(0,_.jsxs)("div",{className:"dialog-actions",children:[(0,_.jsxs)("span",{className:"quiet",children:["\u5DF2\u9009 ",o.size," \u9879"]}),(0,_.jsx)(P,{className:"primary",onClick:()=>a.patch({modal:null}),children:"\u5B8C\u6210\u9009\u62E9"})]})]})}function cM(){let{state:e,controller:t}=ue(),[a,n]=(0,gu.useState)(document.documentElement.dataset.aiseceduAppearance||"light"),[l,r]=(0,gu.useState)(document.documentElement.dataset.aiseceduPalette||"academy");return(0,_.jsxs)(ma,{title:"\u5DE5\u4F5C\u53F0\u8BBE\u7F6E",onClose:()=>t.patch({modal:null}),children:[(0,_.jsxs)("div",{className:"dialog-body",children:[(0,_.jsx)("h3",{children:"\u5916\u89C2"}),(0,_.jsx)("div",{className:"appearance-options",children:[{key:"light",label:"\u6D45\u8272",Icon:_i},{key:"dark",label:"\u6DF1\u8272",Icon:Ui},{key:"system",label:"\u8DDF\u968F\u7CFB\u7EDF",Icon:qi}].map(o=>(0,_.jsxs)(P,{className:a===o.key?"selected":"",onClick:()=>n(o.key),children:[(0,_.jsx)(o.Icon,{size:19}),o.label]},o.key))}),(0,_.jsxs)("label",{className:"field",children:["\u6D45\u8272\u914D\u8272",(0,_.jsxs)("select",{value:l==="midnight"?"academy":l,onChange:o=>r(o.target.value),children:[(0,_.jsx)("option",{value:"academy",children:"\u5B66\u9662\u84DD"}),(0,_.jsx)("option",{value:"forest",children:"\u68EE\u6797\u7EFF"}),(0,_.jsx)("option",{value:"sunrise",children:"\u65E5\u51FA\u6696\u8272"})]})]}),(0,_.jsx)("h3",{children:"\u5FEB\u6377\u952E"}),(0,_.jsxs)("dl",{className:"shortcuts",children:[(0,_.jsx)("dt",{children:"\u641C\u7D22\u4E0E\u547D\u4EE4"}),(0,_.jsx)("dd",{children:"Ctrl / \u2318 K"}),(0,_.jsx)("dt",{children:"\u65B0\u5EFA\u4F1A\u8BDD"}),(0,_.jsx)("dd",{children:"Alt N"}),(0,_.jsx)("dt",{children:"\u5207\u6362\u5DE5\u4F5C\u533A"}),(0,_.jsx)("dd",{children:"Ctrl / \u2318 Shift \\"}),(0,_.jsx)("dt",{children:"\u591A\u884C\u8F93\u5165"}),(0,_.jsx)("dd",{children:"Shift Enter"}),(0,_.jsx)("dt",{children:"\u5207\u6362\u6392\u961F / \u4E0B\u4E00\u6B65\u8865\u5145"}),(0,_.jsx)("dd",{children:"Ctrl / \u2318 Enter"})]}),(0,_.jsx)("p",{className:"quiet",children:"\u4EFB\u52A1\u7531\u670D\u52A1\u5668\u6301\u7EED\u8FD0\u884C\uFF1B\u5173\u95ED\u9875\u9762\u4E0D\u4F1A\u4E22\u5931\u6267\u884C\u8FDB\u5EA6\u3002"})]}),(0,_.jsxs)("div",{className:"dialog-actions",children:[(0,_.jsx)(P,{onClick:()=>t.patch({modal:null}),children:"\u5173\u95ED"}),(0,_.jsx)(P,{className:"primary",disabled:e.busy,onClick:()=>void t.run(async()=>{await t.saveAppearance(a,a==="dark"?"midnight":l==="midnight"?"academy":l),t.patch({modal:null})}),children:"\u4FDD\u5B58\u5916\u89C2"})]})]})}function H0(){let{state:e}=ue();return e.modal==="search"?(0,_.jsx)(uM,{}):e.modal==="sources"||e.modal==="skills"?(0,_.jsx)(sM,{kind:e.modal}):e.modal==="settings"?(0,_.jsx)(cM,{}):null}var ht=W(_e(),1);var xu=class{diff(t,a,n={}){let l;typeof n=="function"?(l=n,n={}):"callback"in n&&(l=n.callback);let r=this.castInput(t,n),o=this.castInput(a,n),i=this.removeEmpty(this.tokenize(r,n)),u=this.removeEmpty(this.tokenize(o,n));return this.diffWithOptionsObj(i,u,n,l)}diffWithOptionsObj(t,a,n,l){var r;let o=m=>{if(m=this.postProcess(m,n),l){setTimeout(function(){l(m)},0);return}else return m},i=a.length,u=t.length,c=1,s=i+u;n.maxEditLength!=null&&(s=Math.min(s,n.maxEditLength));let f=(r=n.timeout)!==null&&r!==void 0?r:1/0,p=Date.now()+f,d=[{oldPos:-1,lastComponent:void 0}],h=this.extractCommon(d[0],a,t,0,n);if(d[0].oldPos+1>=u&&h+1>=i)return o(this.buildValues(d[0].lastComponent,a,t));let y=-1/0,k=1/0,g=()=>{for(let m=Math.max(y,-c);m<=Math.min(k,c);m+=2){let x,S=d[m-1],I=d[m+1];S&&(d[m-1]=void 0);let v=!1;if(I){let N=I.oldPos-m;v=I&&0<=N&&N<i}let T=S&&S.oldPos+1<u;if(!v&&!T){d[m]=void 0;continue}if(!T||v&&S.oldPos<I.oldPos?x=this.addToPath(I,!0,!1,0,n):x=this.addToPath(S,!1,!0,1,n),h=this.extractCommon(x,a,t,m,n),x.oldPos+1>=u&&h+1>=i)return o(this.buildValues(x.lastComponent,a,t))||!0;d[m]=x,x.oldPos+1>=u&&(k=Math.min(k,m-1)),h+1>=i&&(y=Math.max(y,m+1))}c++};if(l)(function m(){setTimeout(function(){if(c>s||Date.now()>p)return l(void 0);g()||m()},0)})();else for(;c<=s&&Date.now()<=p;){let m=g();if(m)return m}}addToPath(t,a,n,l,r){let o=t.lastComponent;return o&&!r.oneChangePerToken&&o.added===a&&o.removed===n?{oldPos:t.oldPos+l,lastComponent:{count:o.count+1,added:a,removed:n,previousComponent:o.previousComponent}}:{oldPos:t.oldPos+l,lastComponent:{count:1,added:a,removed:n,previousComponent:o}}}extractCommon(t,a,n,l,r){let o=a.length,i=n.length,u=t.oldPos,c=u-l,s=0;for(;c+1<o&&u+1<i&&this.equals(n[u+1],a[c+1],r);)c++,u++,s++,r.oneChangePerToken&&(t.lastComponent={count:1,previousComponent:t.lastComponent,added:!1,removed:!1});return s&&!r.oneChangePerToken&&(t.lastComponent={count:s,previousComponent:t.lastComponent,added:!1,removed:!1}),t.oldPos=u,c}equals(t,a,n){return n.comparator?n.comparator(t,a):t===a||!!n.ignoreCase&&t.toLowerCase()===a.toLowerCase()}removeEmpty(t){let a=[];for(let n=0;n<t.length;n++)t[n]&&a.push(t[n]);return a}castInput(t,a){return t}tokenize(t,a){return Array.from(t)}join(t){return t.join("")}postProcess(t,a){return t}get useLongestToken(){return!1}buildValues(t,a,n){let l=[],r;for(;t;)l.push(t),r=t.previousComponent,delete t.previousComponent,t=r;l.reverse();let o=l.length,i=0,u=0,c=0;for(;i<o;i++){let s=l[i];if(s.removed)s.value=this.join(n.slice(c,c+s.count)),c+=s.count;else{if(!s.added&&this.useLongestToken){let f=a.slice(u,u+s.count);f=f.map(function(p,d){let h=n[c+d];return h.length>p.length?h:p}),s.value=this.join(f)}else s.value=this.join(a.slice(u,u+s.count));u+=s.count,s.added||(c+=s.count)}}return l}};var Ah=class extends xu{constructor(){super(...arguments),this.tokenize=fM}equals(t,a,n){return n.ignoreWhitespace?((!n.newlineIsToken||!t.includes(`
`))&&(t=t.trim()),(!n.newlineIsToken||!a.includes(`
`))&&(a=a.trim())):n.ignoreNewlineAtEof&&!n.newlineIsToken&&(t.endsWith(`
`)&&(t=t.slice(0,-1)),a.endsWith(`
`)&&(a=a.slice(0,-1))),super.equals(t,a,n)}},_0=new Ah;function Th(e,t,a){return _0.diff(e,t,a)}function fM(e,t){t.stripTrailingCr&&(e=e.replace(/\r\n/g,`
`));let a=[],n=e.split(/(\n|\r\n)/);n[n.length-1]||n.pop();for(let l=0;l<n.length;l++){let r=n[l];l%2&&!t.newlineIsToken?a[a.length-1]+=r:a.push(r)}return a}var B=W(Le(),1),G0=String.raw`第\s*[1-9]\d{0,2}\s*页(?:的)?\s*(?:原有|原|旧|现有)?(?:讲者备注|演讲备注|演讲稿|讲稿)`,V0="(?:\u6539\u5199|\u91CD\u5199|\u91CD\u65B0\u64B0\u5199|\u91CD\u65B0\u5199|\u8865\u5199|\u6DA6\u8272|\u7F29\u77ED|\u7F29\u51CF|\u6539\u77ED|\u7CBE\u7B80|\u538B\u7F29|\u6D53\u7F29|\u7B80\u5316|\u6821\u5BF9|\u4FEE\u6539|\u4FEE\u8BA2|\u4F18\u5316|\u8C03\u6574)",dM=new RegExp(String.raw`^\s*(?:请\s*)?(?:只|仅)?\s*(?:根据本页(?:可见文字|内容)\s*)?`+String.raw`(?:${V0}\s*${G0}|(?:把|将)?\s*${G0}\s*(?:请\s*)?(?:${V0}|改成|改为))`);function pM(e){let t=e.revision?.content;return typeof t=="string"?t:JSON.stringify(t||{},null,2)}function mM({before:e,after:t}){let a=(0,ht.useMemo)(()=>Th(e,t,{timeout:500}),[e,t]);return(0,B.jsx)("div",{className:"diff-view",children:a?a.map((n,l)=>(0,B.jsxs)("pre",{className:n.added?"diff-added":n.removed?"diff-removed":"diff-same",children:[(0,B.jsx)("span",{"aria-hidden":"true",children:n.added?"+":n.removed?"\u2212":" "}),(0,B.jsx)("code",{children:n.value})]},l)):(0,B.jsxs)("div",{className:"diff-large",children:[(0,B.jsx)("p",{children:"\u6587\u4EF6\u8F83\u5927\uFF0C\u8BF7\u5BF9\u7167\u4E24\u7248\u5B8C\u6574\u6E90\u7801\u3002"}),(0,B.jsx)("pre",{children:e}),(0,B.jsx)("pre",{children:t})]})})}function hM({artifact:e}){let{state:t,controller:a}=ue(),[n,l]=(0,ht.useState)("preview"),[r,o]=(0,ht.useState)(""),[i,u]=(0,ht.useState)(""),[c,s]=(0,ht.useState)(null),[f,p]=(0,ht.useState)(null),[d,h]=(0,ht.useState)(null),[y,k]=(0,ht.useState)(!1),[g,m]=(0,ht.useState)(!1),x=pM(e),S=Pc(e),I=e.type==="slide-deck"&&e.status==="PUBLISHED"&&dM.test(r),v=JSON.stringify([e.id,e.currentRevision,r]),T=I&&!c&&i===v,N=c&&e.type==="slide-deck"&&(I||/^(?:请\s*)?(?:(?:只|仅)\s*)?(?:调整|修改|更改|优化|统一|重新设计)[^：:\n]*(?:版式|布局|排版)\s*[:：]/.test(r.trim())||/^(?:请\s*)?(?:只|仅)\s*(?:修改|调整|润色)[^：:\n]*页\s*(?:的\s*)?(?:文字|文案|措辞)\s*[:：]/.test(r.trim())),U=(0,ht.useRef)(null),w=t.previews[e.id],ne=async()=>{k(!0),m(!1);try{await a.launchPreview(e)}catch(z){a.error(z),m(!0)}finally{k(!1)}};(0,ht.useEffect)(()=>{s(null),p(null),u("")},[e.id,e.currentRevision]),(0,ht.useEffect)(()=>{let z=U.current;if(!z||n!=="source")return;let E=()=>{let O=z.selectionStart,Q=z.selectionEnd;Q>O&&(u(""),s({start:x.slice(0,O).split(`
`).length,end:x.slice(0,Q).split(`
`).length,text:x.slice(O,Q)}))};return z.addEventListener("select",E),z.addEventListener("pointerup",E),z.addEventListener("keyup",E),()=>{z.removeEventListener("select",E),z.removeEventListener("pointerup",E),z.removeEventListener("keyup",E)}},[n,x]);let te=e.status==="GENERATING"||t.jobs.some(z=>z.result?.artifactId===e.id&&["QUEUED","RUNNING"].includes(z.status));return(0,B.jsxs)("div",{className:"artifact-workspace",children:[(0,B.jsxs)("div",{className:"artifact-title",children:[(0,B.jsx)(je,{size:17}),(0,B.jsxs)("div",{children:[(0,B.jsx)("strong",{children:e.title}),(0,B.jsxs)("small",{children:[Yi[e.type]||e.type," \xB7 V",e.currentRevision]})]}),(0,B.jsx)($t,{status:e.status}),(0,B.jsx)("a",{className:"button icon-button",href:`/teacher/artifacts/${pe(e.id)}`,target:"_blank",rel:"noopener noreferrer","aria-label":"\u5728\u5B8C\u6574\u6210\u54C1\u9875\u6253\u5F00",title:"\u5728\u5B8C\u6574\u6210\u54C1\u9875\u6253\u5F00",children:(0,B.jsx)(Hl,{size:15})})]}),(0,B.jsxs)("div",{className:"artifact-subtabs",role:"tablist","aria-label":"\u6210\u54C1\u5DE5\u4F5C\u533A",children:[[{key:"preview",label:"\u9884\u89C8",icon:ro},{key:"source",label:e.type==="learning-flow"?"\u5B66\u4E60\u89C4\u683C":"\u6E90\u7801",icon:ll},{key:"history",label:"\u7248\u672C",icon:Ni}].map(z=>(0,B.jsxs)("button",{role:"tab","aria-selected":n===z.key,onClick:()=>l(z.key),children:[(0,B.jsx)(z.icon,{size:14}),z.label]},z.key)),n==="preview"&&(0,B.jsx)(Y,{label:"\u91CD\u65B0\u52A0\u8F7D\u9884\u89C8",disabled:y||te,onClick:()=>void ne(),children:(0,B.jsx)(Pi,{size:13})})]}),(0,B.jsxs)("div",{className:"artifact-content",children:[(0,B.jsx)("div",{className:"preview-area",hidden:n!=="preview",children:w&&!g?(0,B.jsx)("iframe",{title:`\u4EA4\u4E92\u9884\u89C8\uFF1A${e.title}`,src:w,allow:"fullscreen; clipboard-write",referrerPolicy:"same-origin"}):(0,B.jsxs)(Pa,{icon:(0,B.jsx)(ro,{size:28}),title:te?"\u6210\u54C1\u6B63\u5728\u751F\u6210":g?"\u9884\u89C8\u672A\u80FD\u52A0\u8F7D":"\u5728\u8FD9\u91CC\u76F4\u63A5\u4F53\u9A8C\u6210\u54C1",children:[(0,B.jsx)("p",{children:te?"\u539F\u7248\u672C\u4F1A\u4FDD\u7559\uFF0C\u5B8C\u6210\u540E\u53EF\u4EE5\u7EE7\u7EED\u5BA1\u9605\u3002":S?"\u6253\u5F00\u8BFE\u4EF6\u5DE5\u4F5C\u5BA4\u8FDB\u884C\u7F16\u8F91\u6216\u5206\u6B65\u6F14\u793A\u3002":"\u8BFE\u4EF6\u3001\u4EA4\u4E92\u6F14\u793A\u4E0E\u4E09\u7EF4\u573A\u666F\u4F1A\u5728\u5DE5\u4F5C\u533A\u4E2D\u6253\u5F00\u3002"}),(0,B.jsxs)(P,{className:"primary",disabled:y||te,onClick:()=>void ne(),children:[y?(0,B.jsx)(Dt,{className:"spin",size:15}):(0,B.jsx)(bn,{size:15}),y?"\u6B63\u5728\u8FDE\u63A5\u9884\u89C8":"\u6253\u5F00\u4EA4\u4E92\u9884\u89C8"]})]})}),n==="source"&&(0,B.jsxs)("div",{className:"source-area",children:[(0,B.jsxs)("div",{className:"source-hint",children:[(0,B.jsx)(Fi,{size:14}),"\u9009\u4E2D\u9700\u8981\u4FEE\u6539\u7684\u6E90\u7801\uFF0C\u6DFB\u52A0\u5230\u4E0B\u65B9\u4FEE\u6539\u8981\u6C42"]}),(0,B.jsx)("textarea",{ref:U,className:"source-editor",readOnly:!0,"aria-label":"\u6210\u54C1\u5B8C\u6574\u6E90\u7801",spellCheck:!1,value:x,onSelect:z=>{let{selectionStart:E,selectionEnd:O}=z.currentTarget;O>E&&s({start:x.slice(0,E).split(`
`).length,end:x.slice(0,O).split(`
`).length,text:x.slice(E,O)})}})]}),n==="history"&&(0,B.jsxs)("div",{className:"history-area",children:[(e.history||[]).map(z=>(0,B.jsxs)("div",{className:"revision-row",children:[(0,B.jsxs)("span",{className:"revision-badge",children:["V",z.revision]}),(0,B.jsxs)("div",{children:[(0,B.jsx)("strong",{children:z.revision===e.currentRevision?"\u5F53\u524D\u7248\u672C":z.instruction||"\u5386\u53F2\u7248\u672C"}),(0,B.jsxs)("small",{children:[Cn(z.created)," ",z.author]})]}),(0,B.jsx)(P,{onClick:()=>void Re(`/artifacts/${pe(e.id)}/revisions/${z.revision}`).then(E=>p(E.revision)).catch(a.error),children:"\u6BD4\u8F83"}),z.revision!==e.currentRevision&&e.capabilities?.edit&&(0,B.jsx)(Y,{label:`\u6062\u590D\u7248\u672C ${z.revision}`,onClick:()=>h(z.revision),children:(0,B.jsx)(Ln,{size:14})})]},z.revision)),f&&(0,B.jsxs)("section",{className:"revision-compare",children:[(0,B.jsxs)("header",{children:[(0,B.jsxs)("strong",{children:["V",f.revision," \u2192 V",e.currentRevision]}),(0,B.jsx)(Y,{label:"\u5173\u95ED\u5DEE\u5F02",onClick:()=>p(null),children:(0,B.jsx)(qe,{size:14})})]}),(0,B.jsx)(mM,{before:typeof f.content=="string"?f.content:JSON.stringify(f.content,null,2),after:x})]})]})]}),e.type==="learning-flow"&&(0,B.jsx)("div",{className:"source-hint",children:"\u6559\u5B66\u8BF4\u660E\u3001\u5BA1\u6838\u53D1\u5E03\u548C\u5B66\u751F\u8BC1\u636E\u53EF\u5728\u9884\u89C8\u5185\u7684\u201C\u5185\u5BB9\u4E0E\u5BA1\u6838\u201D\u4E2D\u5904\u7406\u3002"}),e.capabilities?.edit&&!S&&e.type!=="learning-flow"&&(0,B.jsxs)("form",{className:"revision-composer",onSubmit:z=>{if(z.preventDefault(),N)return;let E=c?`${r}

\u4EC5\u4FEE\u6539\u5F53\u524D\u7248\u672C V${e.currentRevision} \u4E2D\u6240\u9009\u8303\u56F4\uFF08\u6E90\u7801\u7B2C ${c.start}\u2013${c.end} \u884C\uFF09\uFF0C\u4FDD\u7559\u5176\u4F59\u5185\u5BB9\u4E0E\u4EA4\u4E92\uFF1A
${c.text}`:r;u(""),a.run(async()=>{await a.revise(e,E,T),o(""),s(null)})},children:[(0,B.jsxs)("div",{className:"revision-context",children:[(0,B.jsx)("strong",{children:"\u5C40\u90E8\u4FEE\u6539"}),(0,B.jsxs)("span",{children:["\u57FA\u4E8E V",e.currentRevision]}),c&&(0,B.jsxs)("span",{className:"chip",children:["\u7B2C ",c.start,"\u2013",c.end," \u884C",(0,B.jsx)(Y,{label:"\u53D6\u6D88\u6E90\u7801\u9009\u533A",onClick:()=>s(null),children:(0,B.jsx)(qe,{size:12})})]})]}),(0,B.jsxs)("div",{className:"revision-input",children:[(0,B.jsx)("textarea",{"aria-label":"\u6210\u54C1\u5C40\u90E8\u4FEE\u6539\u8981\u6C42",placeholder:e.type==="slide-deck"?"\u4F8B\u5982\uFF1A\u8BF7\u8C03\u6574\u7B2C2\u9875\u7684\u7248\u5F0F\uFF1A\u628A\u6807\u9898\u79FB\u5230\u53F3\u4E0A\u65B9":"\u4F8B\u5982\uFF1A\u4E3A\u8FD9\u4E2A\u573A\u666F\u589E\u52A0\u4E00\u4E2A\u51B3\u7B56\u5206\u652F\uFF0C\u4FDD\u7559\u5176\u4ED6\u4EA4\u4E92\u2026",rows:2,value:r,onChange:z=>{u(""),o(z.target.value)}}),(0,B.jsx)("button",{className:"button send-button","aria-label":"\u63D0\u4EA4\u5C40\u90E8\u4FEE\u6539",disabled:!r.trim()||t.busy||te||!!N,children:(0,B.jsx)(Ul,{size:17})})]}),I&&!c&&(0,B.jsxs)("label",{className:"source-hint",children:[(0,B.jsx)("input",{type:"checkbox",checked:T,onChange:z=>u(z.target.checked?v:"")}),"\u5C06\u6307\u5B9A\u9875\u7684\u539F\u8BB2\u7A3F\u7528\u4E8E\u672C\u6B21\u6DA6\u8272\u3002\u52FE\u9009\u540E\uFF0C\u8BE5\u9875\u539F\u7A3F\u4F1A\u53D1\u7ED9\u672C\u8BFE\u7A0B\u914D\u7F6E\u7684\u5916\u90E8\u6A21\u578B\uFF0C\u8BF7\u786E\u8BA4\u53EA\u542B\u53EF\u5206\u4EAB\u7684\u6559\u5B66\u6587\u5B57\u3002 \u672A\u52FE\u9009\u65F6\u53EF\u6839\u636E\u672C\u9875\u53EF\u89C1\u6587\u5B57\u91CD\u5199\u8BB2\u7A3F\u3002"]}),N?(0,B.jsx)("small",{role:"status",children:"\u8BF7\u5148\u53D6\u6D88\u6E90\u7801\u9009\u533A\uFF0C\u518D\u63D0\u4EA4\u6309\u9875\u4FEE\u6539\u3002"}):(0,B.jsx)("small",{children:"\u4FEE\u6539\u4F1A\u4FDD\u5B58\u4E3A\u65B0\u7248\u672C\uFF0C\u53EF\u4EE5\u6BD4\u8F83\u6216\u6062\u590D\u3002"})]}),d!==null&&(0,B.jsxs)(ma,{title:`\u6062\u590D\u7248\u672C V${d}`,onClose:()=>h(null),children:[(0,B.jsx)("div",{className:"dialog-body",children:(0,B.jsx)("p",{children:"\u4ECE\u6240\u9009\u7248\u672C\u521B\u5EFA\u65B0\u8349\u7A3F\u3002\u5F53\u524D\u7248\u672C\u548C\u5386\u53F2\u8BB0\u5F55\u90FD\u4F1A\u4FDD\u7559\u3002"})}),(0,B.jsxs)("div",{className:"dialog-actions",children:[(0,B.jsx)(P,{onClick:()=>h(null),children:"\u53D6\u6D88"}),(0,B.jsx)(P,{className:"primary",disabled:t.busy,onClick:()=>void a.run(async()=>{await a.restore(e,d),h(null)}),children:"\u521B\u5EFA\u65B0\u8349\u7A3F"})]})]})]})}function j0(){let{state:e,controller:t}=ue(),[a,n]=(0,ht.useState)(""),l=e.selectedArtifact?e.artifactDetails[e.selectedArtifact]:null;return(0,B.jsxs)("div",{className:"artifact-panel",children:[(0,B.jsxs)("div",{className:"artifact-tabs",role:"tablist","aria-label":"\u6253\u5F00\u7684\u6210\u54C1",children:[(0,B.jsxs)("button",{role:"tab","aria-selected":!e.selectedArtifact,onClick:()=>t.patch({selectedArtifact:null}),children:[(0,B.jsx)(je,{size:14}),"\u6210\u54C1\u5E93"]}),e.openArtifacts.map(r=>(0,B.jsxs)("div",{className:e.selectedArtifact===r?"active":"",children:[(0,B.jsx)("button",{role:"tab","aria-selected":e.selectedArtifact===r,onClick:()=>t.patch({selectedArtifact:r}),children:e.artifactDetails[r]?.title||"\u8BFB\u53D6\u4E2D\u2026"}),(0,B.jsx)(Y,{label:`\u5173\u95ED\u6210\u54C1 ${e.artifactDetails[r]?.title||""}`,onClick:()=>t.closeArtifact(r),children:(0,B.jsx)(qe,{size:12})})]},r))]}),e.selectedArtifact?l?(0,B.jsx)(hM,{artifact:l},l.id):(0,B.jsx)(Pa,{title:"\u6B63\u5728\u8BFB\u53D6\u6210\u54C1\u2026"}):(0,B.jsxs)("div",{className:"artifact-library",children:[(0,B.jsxs)("label",{className:"search-field",children:[(0,B.jsx)(pa,{size:15}),(0,B.jsx)("input",{"aria-label":"\u641C\u7D22\u6210\u54C1",placeholder:"\u641C\u7D22\u6210\u54C1\u2026",value:a,onChange:r=>n(r.target.value)})]}),(0,B.jsxs)("div",{className:"panel-scroll",children:[e.artifacts.filter(r=>!a||r.title.toLowerCase().includes(a.toLowerCase())).map(r=>(0,B.jsxs)("button",{className:"artifact-list-row",onClick:()=>void t.openArtifact(r.id).catch(t.error),children:[(0,B.jsx)("span",{className:"file-icon",children:(0,B.jsx)(je,{size:20})}),(0,B.jsxs)("span",{children:[(0,B.jsx)("strong",{children:r.title}),(0,B.jsxs)("small",{children:[Yi[r.type]||r.type," \xB7 V",r.currentRevision]})]}),(0,B.jsx)($t,{status:r.status})]},r.id)),!e.artifacts.length&&(0,B.jsx)(Pa,{icon:(0,B.jsx)(je,{size:28}),title:"\u4F60\u7684\u6559\u5B66\u6210\u54C1\u5DE5\u4F5C\u533A",children:(0,B.jsx)("p",{children:"\u751F\u6210\u5B8C\u6210\u540E\uFF0C\u5728\u8FD9\u91CC\u9884\u89C8\u3001\u6BD4\u8F83\u7248\u672C\u548C\u7EE7\u7EED\u4FEE\u6539\u3002"})})]})]})]})}var yu=W(_e(),1);var j=W(Le(),1);function gM({item:e}){let{controller:t}=ue(),a={command:Ql,tool:Qi,workflow:sl,reasoning:Ti,artifact:qa}[e.kind]||Ut,n=e.content;return(0,j.jsxs)("details",{className:`activity-row ${e.status}`,children:[(0,j.jsxs)("summary",{children:[(0,j.jsx)(a,{size:15}),(0,j.jsxs)("span",{children:[(0,j.jsx)("strong",{children:e.title||e.kind}),e.command&&(0,j.jsx)("code",{children:e.command})]}),(0,j.jsx)($t,{status:e.status})]}),(0,j.jsxs)("div",{className:"activity-detail",children:[e.cwd&&(0,j.jsxs)("div",{className:"quiet",children:["\u76EE\u5F55 ",(0,j.jsx)("code",{children:e.cwd})]}),e.command&&(0,j.jsxs)("div",{className:"command-line",children:[(0,j.jsxs)("code",{children:["$ ",e.command]}),(0,j.jsx)(Y,{label:"\u590D\u5236\u547D\u4EE4",onClick:()=>void navigator.clipboard.writeText(e.command).catch(t.error),children:(0,j.jsx)(Pl,{size:13})})]}),e.input!==void 0&&(0,j.jsxs)("section",{children:[(0,j.jsx)("h4",{children:"\u5DE5\u5177\u8F93\u5165"}),(0,j.jsx)(Sa,{value:e.input})]}),n&&(0,j.jsxs)("section",{children:[(0,j.jsx)("h4",{children:e.kind==="reasoning"?"\u6A21\u578B\u8FD4\u56DE\u7684\u63A8\u7406\u6458\u8981":"\u8FC7\u7A0B\u8BB0\u5F55"}),(0,j.jsx)(Sa,{value:n})]}),e.output&&(0,j.jsxs)("section",{children:[(0,j.jsx)("h4",{children:"\u8F93\u51FA"}),(0,j.jsx)(Sa,{value:e.output})]}),e.exitCode!==void 0&&(0,j.jsxs)("div",{className:"exit-code",children:["\u9000\u51FA\u7801 ",(0,j.jsx)("strong",{children:e.exitCode})]}),e.usage&&(0,j.jsx)(Sa,{value:e.usage}),e.startedAt&&e.completedAt&&(0,j.jsxs)("small",{className:"quiet",children:["\u8017\u65F6 ",Math.max(0,(e.completedAt-e.startedAt)/1e3).toFixed(1)," \u79D2"]})]})]})}function X0(){let{state:e,controller:t}=ue(),[a,n]=(0,yu.useState)("all"),[l,r]=(0,yu.useState)(""),o=e.jobs.filter(s=>s.threadId===e.thread?.id||s.id===e.selectedJob),i=e.jobs.find(s=>s.id===e.selectedJob)||o[0],c=(0,yu.useMemo)(()=>i?qc(i.id,e.events[i.id]||[],et(i)):[],[i,e.events]).filter(s=>s.kind!=="message"&&(a==="all"||a===s.kind)&&(!l||`${s.title} ${s.command||""} ${s.output||""} ${s.content||""}`.toLowerCase().includes(l.toLowerCase())));return(0,j.jsxs)("div",{className:"activity-panel",children:[(0,j.jsxs)("div",{className:"panel-toolbar",children:[(0,j.jsxs)("select",{"aria-label":"\u9009\u62E9\u4EFB\u52A1\u6267\u884C\u8BB0\u5F55",value:i?.id||"",onChange:s=>t.selectJob(s.target.value),children:[(0,j.jsx)("option",{value:"",disabled:!0,children:"\u9009\u62E9\u4EFB\u52A1"}),o.map(s=>(0,j.jsxs)("option",{value:s.id,children:[s.title||s.kind," \xB7 ",s.id.slice(0,8)]},s.id))]}),(0,j.jsx)(Y,{label:"\u6253\u5F00\u4EFB\u52A1\u4E2D\u5FC3",onClick:()=>t.patch({taskCenter:!0}),children:(0,j.jsx)(fa,{size:16})})]}),i&&(0,j.jsxs)("div",{className:"activity-job",children:[(0,j.jsx)($t,{status:i.status}),(0,j.jsx)("span",{children:i.stage||"\u4EFB\u52A1\u6267\u884C"}),Number.isFinite(i.progress)&&(0,j.jsx)("progress",{"aria-label":"\u4EFB\u52A1\u8FDB\u5EA6",max:100,value:i.progress}),["FAILED","CANCELED"].includes(i.status)&&(0,j.jsx)(P,{onClick:()=>void t.run(()=>t.retry(i.id)),children:"\u4ECE\u4FDD\u7559\u7ED3\u679C\u7EE7\u7EED"})]}),(0,j.jsxs)("div",{className:"activity-filters",children:[(0,j.jsx)(ol,{size:14}),(0,j.jsxs)("select",{"aria-label":"\u6267\u884C\u8BB0\u5F55\u7C7B\u578B",value:a,onChange:s=>n(s.target.value),children:[(0,j.jsx)("option",{value:"all",children:"\u5168\u90E8\u8BB0\u5F55"}),(0,j.jsx)("option",{value:"workflow",children:"\u8BA1\u5212\u4E0E\u6D41\u7A0B"}),(0,j.jsx)("option",{value:"tool",children:"\u5DE5\u5177\u8C03\u7528"}),(0,j.jsx)("option",{value:"command",children:"\u8FD0\u884C\u547D\u4EE4"}),(0,j.jsx)("option",{value:"reasoning",children:"\u63A8\u7406\u6458\u8981"}),(0,j.jsx)("option",{value:"artifact",children:"\u6210\u54C1"})]}),(0,j.jsx)("input",{"aria-label":"\u641C\u7D22\u6267\u884C\u8BB0\u5F55",placeholder:"\u641C\u7D22\u8F93\u51FA\u2026",value:l,onChange:s=>r(s.target.value)})]}),(0,j.jsxs)("div",{className:"panel-scroll",children:[i?.modelRoute?.invocationStatus&&(0,j.jsxs)("details",{className:"usage-summary",children:[(0,j.jsx)("summary",{children:"\u6A21\u578B\u4E0E\u7528\u91CF \xB7 \u6700\u8FD1\u4E00\u6B21\u8C03\u7528"}),(0,j.jsx)("p",{children:i.modelRoute.actualModel}),i.modelRoute.usage&&(0,j.jsx)(Sa,{value:i.modelRoute.usage}),Number.isFinite(i.modelRoute.latencyMs)&&(0,j.jsxs)("small",{children:["\u8017\u65F6 ",(i.modelRoute.latencyMs/1e3).toFixed(1)," \u79D2"]})]}),c.map(s=>(0,j.jsx)(gM,{item:s},s.id)),!c.length&&(0,j.jsx)(Pa,{icon:(0,j.jsx)(Ut,{size:26}),title:i?"\u7B49\u5F85\u6267\u884C\u8BB0\u5F55":"\u6267\u884C\u8FC7\u7A0B\u4F1A\u663E\u793A\u5728\u8FD9\u91CC",children:(0,j.jsx)("p",{children:i?"\u8BB0\u5F55\u6765\u81EA\u540E\u53F0\u4EFB\u52A1\u3002\u6B63\u5728\u7B49\u5F85\u65B0\u7684\u4E8B\u4EF6\u3002":"\u8BA1\u5212\u3001\u5DE5\u5177\u8C03\u7528\u3001\u547D\u4EE4\u8F93\u51FA\u4E0E\u7ED3\u679C\u4F1A\u968F\u4EFB\u52A1\u66F4\u65B0\u3002"})})]}),(0,j.jsx)("footer",{className:"panel-note",children:"\u4EC5\u663E\u793A\u540E\u53F0\u5B9E\u9645\u8FD4\u56DE\u7684\u6267\u884C\u4E8B\u4EF6"})]})}var Z=W(Le(),1);function Q0(){let{state:e,controller:t}=ue(),a=e.context.teacherDojos||[],n=a.find(l=>l.id===e.thread?.dojoId);return(0,Z.jsxs)("div",{className:"panel-scroll context-panel",children:[(0,Z.jsxs)("header",{className:"section-heading",children:[(0,Z.jsx)(_l,{size:18}),(0,Z.jsx)("h2",{children:"\u672C\u6B21\u521B\u4F5C\u7684\u4E0A\u4E0B\u6587"})]}),(0,Z.jsx)("p",{className:"quiet",children:"\u9009\u62E9\u8BFE\u7A0B\u3001\u8D44\u6599\u548C\u6280\u80FD\uFF0C\u4E3A\u8FD9\u6B21\u6559\u5B66\u4EFB\u52A1\u63D0\u4F9B\u4F9D\u636E\u3002"}),(0,Z.jsxs)("section",{children:[(0,Z.jsx)("h3",{children:"\u8BFE\u7A0B\u4E0E\u7AE0\u8282"}),(0,Z.jsxs)("label",{className:"field",children:["\u5F52\u5C5E\u8BFE\u7A0B",(0,Z.jsxs)("select",{"aria-label":"\u5F52\u5C5E\u8BFE\u7A0B",disabled:e.busy,value:e.thread?.dojoId??"",onChange:l=>void t.run(()=>t.setScope(l.target.value)),children:[(0,Z.jsx)("option",{value:"",children:"\u72EC\u7ACB\u521B\u4F5C\uFF0C\u6682\u4E0D\u5173\u8054\u8BFE\u7A0B"}),a.map(l=>(0,Z.jsx)("option",{value:l.id,children:l.name},l.id))]})]}),n&&(0,Z.jsxs)("label",{className:"field",children:["\u7AE0\u8282",(0,Z.jsxs)("select",{"aria-label":"\u5F52\u5C5E\u7AE0\u8282",disabled:e.busy,value:e.thread?.moduleIndex??"",onChange:l=>void t.run(()=>t.setScope(String(n.id),l.target.value)),children:[(0,Z.jsx)("option",{value:"",children:"\u6574\u95E8\u8BFE\u7A0B"}),(n.modules||[]).map(l=>(0,Z.jsx)("option",{value:l.index??l.moduleIndex,children:l.name||l.title},l.index??l.moduleIndex))]})]})]}),(0,Z.jsxs)("section",{children:[(0,Z.jsxs)("header",{children:[(0,Z.jsxs)("h3",{children:[(0,Z.jsx)(Oa,{size:15}),"\u672C\u8F6E\u5F15\u7528\u8D44\u6599"]}),(0,Z.jsx)(Y,{label:"\u6DFB\u52A0\u5F15\u7528\u8D44\u6599",onClick:()=>t.openCatalog("sources"),children:(0,Z.jsx)(Fa,{size:15})})]}),!e.draft.sources.length&&(0,Z.jsx)("p",{className:"quiet",children:"\u5F15\u7528\u8D44\u6599\u540E\uFF0C\u667A\u80FD\u4F53\u4F1A\u4F18\u5148\u4F9D\u636E\u539F\u6587\u5904\u7406\u3002"}),e.draft.sources.map(l=>(0,Z.jsxs)("div",{className:"context-item",children:[(0,Z.jsx)(ul,{size:15}),(0,Z.jsx)("span",{children:l.name}),(0,Z.jsx)(Y,{label:`\u79FB\u9664 ${l.name}`,onClick:()=>t.setDraft({sources:e.draft.sources.filter(r=>r.id!==l.id)}),children:(0,Z.jsx)(qe,{size:14})})]},l.id)),(0,Z.jsxs)(P,{onClick:()=>t.openCatalog("sources"),children:[(0,Z.jsx)(Fa,{size:14}),"\u5F15\u7528\u8D44\u6599\u5E93"]})]}),(0,Z.jsxs)("section",{children:[(0,Z.jsxs)("header",{children:[(0,Z.jsxs)("h3",{children:[(0,Z.jsx)(Pt,{size:15}),"\u672C\u8F6E\u6307\u5B9A\u6280\u80FD"]}),(0,Z.jsx)(Y,{label:"\u6DFB\u52A0\u6280\u80FD",onClick:()=>t.openCatalog("skills"),children:(0,Z.jsx)(Fa,{size:15})})]}),!e.draft.skills.length&&(0,Z.jsx)("p",{className:"quiet",children:"\u667A\u80FD\u4F53\u4F1A\u6309\u4EFB\u52A1\u9009\u62E9\u6280\u80FD\uFF0C\u4E5F\u53EF\u4EE5\u624B\u52A8\u6307\u5B9A\u3002"}),e.draft.skills.map(l=>(0,Z.jsxs)("div",{className:"context-item",children:[(0,Z.jsx)(Pt,{size:15}),(0,Z.jsxs)("span",{children:["/",l]}),(0,Z.jsx)(Y,{label:`\u79FB\u9664 ${l}`,onClick:()=>t.setDraft({skills:e.draft.skills.filter(r=>r!==l)}),children:(0,Z.jsx)(qe,{size:14})})]},l)),(0,Z.jsxs)(P,{onClick:()=>t.openCatalog("skills"),children:[(0,Z.jsx)(Fa,{size:14}),"\u9009\u62E9\u6280\u80FD"]})]}),(0,Z.jsxs)("section",{children:[(0,Z.jsx)("h3",{children:"\u5F53\u524D\u6A21\u578B"}),(0,Z.jsx)("strong",{children:"DeepSeek v4.1 Flash"}),(0,Z.jsx)("p",{className:"quiet",children:"\u5168\u5C40\u667A\u80FD\u4F53\u4E0E\u5185\u5BB9\u751F\u6210"})]}),(0,Z.jsxs)("a",{className:"button",href:"/teacher/library",target:"_blank",rel:"noopener noreferrer",children:[(0,Z.jsx)(Oa,{size:15}),"\u7BA1\u7406\u5B8C\u6574\u8D44\u6599\u5E93",(0,Z.jsx)(Hl,{size:13})]})]})}var G=W(Le(),1);function Y0(){let{state:e,controller:t}=ue(),[a,n]=(0,Aa.useState)(t.storage.value("panelWidth",520)),[l,r]=(0,Aa.useState)(t.storage.value("filePreviewWidth",Math.round(window.innerWidth*.44))),[o,i]=(0,Aa.useState)(!1),[u,c]=(0,Aa.useState)(t.storage.value("sidebarCollapsed",!1)),s=(0,Aa.useRef)(null);(0,Aa.useEffect)(()=>{t.boot();let m=v=>{if(!v.isComposing){if(document.querySelector('#searchModal:not([hidden])[aria-hidden="false"]')){(v.metaKey||v.ctrlKey)&&v.key.toLowerCase()==="k"&&(v.preventDefault(),v.stopPropagation(),document.getElementById("searchInput")?.focus());return}v.target instanceof Element&&v.target.closest(".product-navbar")||((v.metaKey||v.ctrlKey)&&v.key.toLowerCase()==="k"&&(v.preventDefault(),v.stopPropagation(),t.patch({modal:t.snapshot().modal==="search"?null:"search"})),v.altKey&&v.key.toLowerCase()==="n"&&(v.preventDefault(),t.newThread()),(v.metaKey||v.ctrlKey)&&v.shiftKey&&v.code==="Backslash"&&(v.preventDefault(),t.togglePanel()))}},x=()=>{let v=new URLSearchParams(location.search).get("thread");v?t.activate(v,!1).catch(t.error):t.newThread()},S=document.getElementById("global-teaching-tasks"),I=v=>{if(v.button||v.metaKey||v.ctrlKey||v.shiftKey||v.altKey)return;v.preventDefault(),t.patch({taskCenter:!0,sidebarOpen:!1});let T=document.getElementById("product-nav-toggle");T?.getAttribute("aria-expanded")==="true"&&T.click()};return S?.addEventListener("click",I),window.addEventListener("keydown",m,!0),window.addEventListener("popstate",x),()=>{t.dispose(),window.removeEventListener("keydown",m,!0),S?.removeEventListener("click",I),window.removeEventListener("popstate",x)}},[t]);let f=e.panel==="files"?e.selectedFile:null,p=f?l:a,d=f?"filePreviewWidth":"panelWidth",h=f?r:n,y=()=>{let m=window.innerWidth,x=m-(u?360:610),S=f?m*(m<=820?.52:.53):x;return Math.max(340,Math.min(x,Math.floor(S)))},k=()=>{t.togglePanel(),i(!1)};(0,Aa.useEffect)(()=>{e.panelOpen||i(!1)},[e.panelOpen]),(0,Aa.useEffect)(()=>{if(!e.panelOpen||!f||e.modal||e.sidebarOpen)return;let m=x=>{x.key!=="Escape"||x.defaultPrevented||x.isComposing||(o?i(!1):t.togglePanel())};return window.addEventListener("keydown",m),()=>window.removeEventListener("keydown",m)},[t,o,f,e.modal,e.panelOpen,e.sidebarOpen]);let g=e.context.teacherDojos?.find(m=>m.id===e.thread?.dojoId);return(0,G.jsxs)("div",{className:`workbench ${e.panelOpen?"has-panel":""} ${o&&e.panelOpen?"expanded-panel":""} ${f?"has-file-preview":""} ${u?"sidebar-collapsed":""}`,"data-ready":!e.booting,style:{"--panel-width":`${p}px`},children:[(0,G.jsx)(Ob,{}),(0,G.jsxs)("main",{className:"main-pane",children:[(0,G.jsxs)("header",{className:"workspace-header",children:[(0,G.jsx)(Y,{className:"desktop-sidebar-toggle",label:u?"\u5C55\u5F00\u4F1A\u8BDD\u5BFC\u822A":"\u6536\u8D77\u4F1A\u8BDD\u5BFC\u822A","aria-controls":"workbench-sidebar","aria-expanded":!u,onClick:()=>{c(!u),t.storage.set("sidebarCollapsed",!u)},children:(0,G.jsx)(xn,{size:18})}),(0,G.jsx)(Y,{className:"mobile-only",label:"\u6253\u5F00\u4F1A\u8BDD\u5BFC\u822A","aria-controls":"workbench-sidebar","aria-expanded":e.sidebarOpen,onClick:()=>t.patch({sidebarOpen:!0}),children:(0,G.jsx)(xn,{size:18})}),(0,G.jsx)("span",{className:"agent-mark",children:(0,G.jsx)(Ca,{size:16})}),(0,G.jsxs)("div",{className:"workspace-breadcrumb",children:[(0,G.jsx)("span",{children:g?.name||"\u72EC\u7ACB\u521B\u4F5C"}),(0,G.jsx)(Fl,{size:12}),(0,G.jsx)("strong",{children:e.taskCenter?"\u4EFB\u52A1\u4E2D\u5FC3":e.thread?.title||"\u65B0\u4F1A\u8BDD"})]}),(0,G.jsxs)("div",{className:"header-actions",children:[!e.online&&(0,G.jsxs)("span",{className:"offline",title:"\u6B63\u5728\u91CD\u65B0\u8FDE\u63A5\uFF0C\u8F93\u5165\u5185\u5BB9\u4F1A\u4FDD\u7559",children:[(0,G.jsx)(Xi,{size:15}),"\u91CD\u65B0\u8FDE\u63A5"]}),e.thread&&(0,G.jsx)(Y,{label:"\u521B\u5EFA\u4F1A\u8BDD\u5206\u652F",disabled:e.busy,onClick:()=>void t.run(()=>t.fork(e.thread.id)),children:(0,G.jsx)(hn,{size:16})}),(0,G.jsx)(Y,{label:e.panelOpen?"\u6536\u8D77\u5DE5\u4F5C\u533A":"\u6253\u5F00\u5DE5\u4F5C\u533A","aria-pressed":e.panelOpen,onClick:()=>t.togglePanel(),children:(0,G.jsx)(jl,{size:18})})]})]}),e.error&&(0,G.jsxs)("div",{className:"notice error",role:"alert",children:[(0,G.jsx)("span",{children:e.error}),(0,G.jsx)(Y,{label:"\u5173\u95ED\u9519\u8BEF\u63D0\u793A",onClick:()=>t.patch({error:null}),children:(0,G.jsx)(qe,{size:14})})]}),e.notice&&(0,G.jsxs)("div",{className:"notice",role:"status",children:[(0,G.jsx)("span",{children:e.notice}),(0,G.jsx)(Y,{label:"\u5173\u95ED\u63D0\u793A",onClick:()=>t.patch({notice:null}),children:(0,G.jsx)(qe,{size:14})})]}),e.booting||e.loadingThread?(0,G.jsxs)("div",{className:"workspace-loading",children:[(0,G.jsx)(Ca,{size:25}),(0,G.jsx)("p",{children:e.loadingThread?"\u6B63\u5728\u8BFB\u53D6\u4F1A\u8BDD\u2026":"\u6B63\u5728\u6253\u5F00\u5DE5\u4F5C\u53F0\u2026"})]}):e.taskCenter?(0,G.jsx)(P0,{}):(0,G.jsx)(F0,{}),(0,G.jsxs)("nav",{className:"mobile-panel-nav","aria-label":"\u79FB\u52A8\u5DE5\u4F5C\u533A",children:[(0,G.jsx)(P,{onClick:()=>{e.panelOpen&&k(),t.patch({taskCenter:!1})},children:"\u5BF9\u8BDD"}),(0,G.jsxs)(P,{onClick:()=>t.setPanel("artifacts"),children:[(0,G.jsx)(je,{size:15}),"\u6210\u54C1"]}),(0,G.jsxs)(P,{onClick:()=>t.setPanel("activity"),children:[(0,G.jsx)(Ut,{size:15}),"\u6267\u884C"]}),(0,G.jsxs)(P,{onClick:()=>t.setPanel("context"),children:[(0,G.jsx)(da,{size:15}),"\u4E0A\u4E0B\u6587"]})]})]}),e.panelOpen&&(0,G.jsxs)(G.Fragment,{children:[(0,G.jsx)("div",{className:"panel-resizer",role:"separator","aria-label":"\u8C03\u6574\u5DE5\u4F5C\u533A\u5BBD\u5EA6","aria-orientation":"vertical","aria-valuenow":Math.min(y(),Math.max(340,p)),"aria-valuemin":340,"aria-valuemax":y(),tabIndex:0,onKeyDown:m=>{if(["ArrowLeft","ArrowRight","Home"].includes(m.key)){m.preventDefault();let x=m.key==="Home"?Math.min(y(),f?Math.round(window.innerWidth*.44):520):Math.min(y(),Math.max(340,p+(m.key==="ArrowLeft"?32:-32)));h(x),t.storage.set(d,x)}},onPointerDown:m=>{s.current={x:m.clientX,width:m.currentTarget.nextElementSibling?.getBoundingClientRect().width||p},m.currentTarget.setPointerCapture(m.pointerId)},onPointerMove:m=>{s.current&&h(Math.min(y(),Math.max(340,s.current.width+s.current.x-m.clientX)))},onPointerUp:m=>{s.current=null,m.currentTarget.releasePointerCapture(m.pointerId);let x=m.currentTarget.nextElementSibling?.getBoundingClientRect().width||p;t.storage.set(d,Math.round(x))},onPointerCancel:()=>{s.current=null}}),(0,G.jsx)("aside",{className:"work-area",id:f?"workbench-file-preview":void 0,"aria-label":f?"\u5BF9\u8BDD\u6587\u4EF6\u9884\u89C8":"\u6210\u54C1\u4E0E\u6267\u884C\u5DE5\u4F5C\u533A",children:f?(0,G.jsx)(q0,{file:f,expanded:o,onExpand:()=>i(!o),onClose:k}):(0,G.jsxs)(G.Fragment,{children:[(0,G.jsxs)("header",{className:"panel-header",children:[(0,G.jsx)("div",{role:"tablist","aria-label":"\u5DE5\u4F5C\u533A\u9875\u9762",children:[{key:"artifacts",title:"\u6210\u54C1",Icon:je},{key:"activity",title:"\u6267\u884C",Icon:Ut},{key:"context",title:"\u4E0A\u4E0B\u6587",Icon:da}].map(m=>(0,G.jsxs)("button",{role:"tab","aria-selected":e.panel===m.key,onClick:()=>t.setPanel(m.key),children:[(0,G.jsx)(m.Icon,{size:15}),m.title]},m.key))}),(0,G.jsx)(Y,{className:"desktop-only",label:o?"\u6062\u590D\u5206\u680F":"\u653E\u5927\u5DE5\u4F5C\u533A",onClick:()=>i(!o),children:o?(0,G.jsx)(Vl,{size:15}):(0,G.jsx)(Gl,{size:15})}),(0,G.jsx)(Y,{label:"\u5173\u95ED\u5DE5\u4F5C\u533A",onClick:k,children:(0,G.jsx)(qe,{size:16})})]}),(0,G.jsx)("div",{className:"panel-content",hidden:e.panel!=="artifacts",children:(0,G.jsx)(j0,{})}),(0,G.jsx)("div",{className:"panel-content",hidden:e.panel!=="activity",children:(0,G.jsx)(X0,{})}),(0,G.jsx)("div",{className:"panel-content",hidden:e.panel!=="context",children:(0,G.jsx)(Q0,{})})]})})]}),(0,G.jsx)(H0,{})]})}var Jc=class{storage;listeners=new Set;state;epoch=0;watch;timer;cursor={};stop=!1;activeJobReads=new Set;pendingSubmit=null;creating;mutationKeys=new Map;catalogLoaded=new Set;classroomActions=new Set;constructor(t){this.storage=new jc(t),this.state={booting:!0,loadingThread:!1,busy:!1,online:!0,threads:[],thread:null,context:{},jobs:[],events:{},selectedJob:null,artifacts:[],artifactDetails:{},previews:{},openArtifacts:[],selectedArtifact:null,materials:[],skills:[],draft:this.storage.draft(null),uploads:[],panel:"artifacts",selectedFile:null,panelOpen:window.innerWidth>720&&this.storage.value("panelOpen",!1),sidebarOpen:!1,taskCenter:!1,modal:null,error:null,notice:null,threadFilter:"",archived:!1}}subscribe=t=>(this.listeners.add(t),()=>{this.listeners.delete(t)});snapshot=()=>this.state;patch=t=>{this.state={...this.state,...t},this.listeners.forEach(a=>a())};error=t=>{this.stop||this.patch({error:t instanceof Error?t.message:String(t)})};notify=t=>this.patch({notice:t,error:null});async run(t){if(!this.state.busy){this.patch({busy:!0,error:null});try{await t()}catch(a){this.error(a)}finally{this.patch({busy:!1})}}}async mutate(t,a={},n="POST"){let l=JSON.stringify([t,n,a]),r=this.mutationKeys.get(l)||ur();this.mutationKeys.set(l,r);let o=await Re(t,{method:n,body:a,key:r});return this.mutationKeys.delete(l),o}async boot(){try{let t=await Promise.allSettled([Re("/context?view=teacher-shell"),this.loadThreads(),this.loadArtifacts()]);if(t[0].status==="rejected")throw t[0].reason;this.patch({context:t[0].value});for(let r of t.slice(1))r.status==="rejected"&&this.error(r.reason);let a=new URLSearchParams(location.search).get("thread");a&&await this.activate(a,!1);let n=new URLSearchParams(location.search);if(!a&&n.get("inquiry")==="1"){this.setDraft({learningPattern:"process-inquiry",text:n.get("prompt")||"\u521B\u5EFA AES-128 \u6D41\u7A0B\u63A2\u7A76\u5F0F\u5B66\u4E60\u9879\u76EE\uFF0C\u5148\u4FDD\u5B58\u8349\u7A3F\u3002"});let r=(this.state.context.teacherDojos||[]).find(i=>i.referenceId===n.get("dojo"));if(n.has("dojo")&&!r)throw new Error("\u76EE\u6807\u8BFE\u7A0B\u4E0D\u5B58\u5728\u6216\u65E0\u6743\u8BBF\u95EE\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u8BFE\u7A0B\u3002");r&&await this.setScope(String(r.id),n.get("module")??"");let o=new URL(location.href);for(let i of["inquiry","prompt","dojo","module"])o.searchParams.delete(i);history.replaceState({},"",o)}let l=new URLSearchParams(location.search).get("artifact");l&&!this.state.selectedFile&&await this.openArtifact(l),await this.loadJobs(),new URLSearchParams(location.search).get("tasks")==="1"&&this.patch({taskCenter:!0})}catch(t){this.error(t)}finally{this.patch({booting:!1}),this.schedule()}}dispose(){this.stop=!0,this.epoch++,this.watch?.abort(),clearTimeout(this.timer)}setDraft(t){let a={...this.state.draft,...t};this.storage.save(this.state.thread?.id||null,a),this.patch({draft:a})}setPanel(t){this.state.selectedFile&&this.updateFileUrl(null),this.patch({panel:t,panelOpen:!0,selectedFile:null,taskCenter:!1}),this.storage.set("panelOpen",!0)}openFile(t,a=!0){this.patch({panel:"files",panelOpen:!0,selectedFile:t,taskCenter:!1}),a&&this.updateFileUrl(t.id)}updateFileUrl(t){let a=new URL(location.href);t?a.searchParams.set("file",t):a.searchParams.delete("file"),location.href!==a.href&&history.replaceState(history.state,"",a)}togglePanel(){if(this.state.panel==="files"){this.updateFileUrl(null),this.patch({panel:"artifacts",panelOpen:!1,selectedFile:null});return}this.storage.set("panelOpen",!this.state.panelOpen),this.patch({panelOpen:!this.state.panelOpen})}async loadThreads(t=this.state.threadFilter,a=this.state.archived){let n=await Re(`/threads?limit=200&view=${a?"archived":"active"}&q=${pe(t)}`);if(t===this.state.threadFilter&&a===this.state.archived){let l=n.threads||[],r=document.getElementById("cocreation-workbench")?.dataset.scopedTeaching==="true";this.patch({threads:r?l.map(o=>o.latestMessage?{...o,latestMessage:_c(o.latestMessage)}:o):l})}}filterThreads(t,a=this.state.archived){this.patch({threadFilter:t,archived:a}),this.loadThreads(t,a).catch(this.error)}newThread(){this.state.panel==="files"&&this.togglePanel(),this.epoch++,this.watch?.abort(),this.pendingSubmit=null,this.patch({thread:null,loadingThread:!1,draft:this.storage.draft(null),uploads:[],sidebarOpen:!1,taskCenter:!1,selectedJob:null,error:null}),this.updateUrl(null)}updateUrl(t,a=!1){let n=new URL(location.href);n.searchParams.set("view","conversation"),n.searchParams.delete("artifact"),n.searchParams.delete("file"),n.searchParams.delete("newProject"),n.searchParams.delete("tasks"),t?n.searchParams.set("thread",t):n.searchParams.delete("thread"),location.href!==n.href&&history[a?"replaceState":"pushState"]({},"",n)}async activate(t,a=!0){let n=a?null:new URLSearchParams(location.search).get("file");this.state.panel==="files"&&this.patch({panel:"artifacts",panelOpen:!1,selectedFile:null});let l=++this.epoch;this.watch?.abort(),this.pendingSubmit=null,this.patch({loadingThread:!0,error:null,sidebarOpen:!1,taskCenter:!1,uploads:[]});try{let{thread:r}=await Re(`/threads/${pe(t)}`);if(l!==this.epoch||this.stop)return;if(this.patch({thread:r,draft:this.storage.draft(t,r.context?.learningPattern?.id),selectedJob:r.harnessJobs?.[0]?.id||null}),a)this.updateUrl(t);else if(n){let o=sr(r.messages).find(i=>i.id===n);o?this.openFile(o,!1):this.updateFileUrl(null)}this.watchThread(t,l),await this.loadJobs(t)}finally{l===this.epoch&&this.patch({loadingThread:!1})}}async ensureThread(){if(this.state.thread)return this.state.thread;if(this.creating)return this.creating;let t=this.epoch;return this.creating=this.mutate("/threads",{title:this.state.draft.text.trim().slice(0,70)||"\u65B0\u7684\u6559\u5B66\u521B\u4F5C",phase:"COURSE_SETUP"}).then(({thread:a})=>{if(t!==this.epoch)throw new Error("\u4F1A\u8BDD\u5DF2\u5207\u6362\uFF0C\u8BF7\u56DE\u5230\u539F\u4F1A\u8BDD\u7EE7\u7EED\u3002");return this.storage.save(a.id,this.state.draft),this.storage.save(null,Xc()),this.patch({thread:a,threads:[a,...this.state.threads]}),this.updateUrl(a.id,!0),this.watchThread(a.id,t),a}).finally(()=>{this.creating=void 0}),this.creating}async refreshThread(t=this.state.thread?.id,a=this.epoch){if(!t)return;let n=await Re(`/threads/${pe(t)}`);a===this.epoch&&this.state.thread?.id===t&&this.patch({thread:n.thread})}watchThread(t,a){this.watch?.abort();let n=new AbortController;this.watch=n,(async()=>{let l=Number(this.state.thread?.lastEventSequence||0),r=0;for(;!this.stop&&!n.signal.aborted&&a===this.epoch;)try{let o=await Re(`/threads/${pe(t)}/events?after=${l}&limit=200&waitMs=15000`,{signal:n.signal});if(n.signal.aborted||a!==this.epoch)break;if(!Number.isSafeInteger(o.nextCursor)||o.nextCursor<l)throw new Error("\u4F1A\u8BDD\u8BB0\u5F55\u6682\u65F6\u65E0\u6CD5\u540C\u6B65\uFF0C\u8BF7\u5237\u65B0\u8BFB\u53D6\u3002");l=o.nextCursor,this.patch({online:!0}),r=0,o.events?.length&&(await this.refreshThread(t,a),await this.loadJobs(t)),o.events?.length||await new Promise(i=>setTimeout(i,300))}catch(o){if(n.signal.aborted||a!==this.epoch)break;if(this.patch({online:!1}),r++,o instanceof wa&&[401,403,404].includes(o.status)){this.error(o);break}await new Promise(i=>setTimeout(i,Math.min(15e3,1500*r)))}})()}schedule(){this.stop||(this.timer=setTimeout(async()=>{if(!document.hidden)try{await this.loadJobs();let t=this.state.jobs.filter(l=>l.threadId===this.state.thread?.id&&!et(l)),a=this.state.jobs.find(l=>l.id===this.state.selectedJob),n=[...new Set([...t.map(l=>l.id),...a?[a.id]:[]])];await Promise.allSettled(n.slice(0,6).map(l=>this.loadEvents(l)))}catch{this.patch({online:!1})}this.schedule()},this.state.jobs.some(t=>!et(t))?2200:9e3))}async loadJobs(t){let a=await Re(`/jobs?view=all&limit=100${t?"&threadId="+pe(t):""}`),n=new Map(this.state.jobs.map(i=>[i.id,i])),l=a.jobs||[],r=l.some(i=>et(i)&&n.has(i.id)&&!et(n.get(i.id))),o=t?[...l,...this.state.jobs.filter(i=>i.threadId!==t)]:l;this.patch({jobs:o,online:!0}),r&&await Promise.allSettled([this.refreshThread(),this.loadArtifacts(),...this.state.openArtifacts.map(i=>this.loadArtifact(i))])}async deriveDebateCandidates(t,a){let l=(await this.mutate(`/candidate-sets/${pe(t)}/derive`,a)).job;return this.patch({jobs:[l,...this.state.jobs.filter(r=>r.id!==l.id)]}),l}async loadEvents(t){if(!this.activeJobReads.has(t)){this.activeJobReads.add(t);try{for(let a=0;a<8;a++){let n=await Re(`/jobs/${pe(t)}/events?limit=128${this.cursor[t]?"&cursor="+pe(this.cursor[t]):""}`);if(this.cursor[t]=n.eventCursor||this.cursor[t],this.patch({events:{...this.state.events,[t]:k0(this.state.events[t]||[],n.events||[])},jobs:n.job&&!this.state.jobs.some(l=>l.id===t)?[...this.state.jobs,n.job]:this.state.jobs.map(l=>l.id===t?{...l,...n.job}:l)}),!n.hasMore)break}}catch(a){if(a instanceof wa&&a.code==="INVALID_ACTIVITY_CURSOR")delete this.cursor[t],this.patch({events:{...this.state.events,[t]:[]}});else throw a}finally{this.activeJobReads.delete(t)}}}selectJob(t){this.patch({selectedJob:t}),this.setPanel("activity"),this.loadEvents(t).catch(this.error)}async send(t={},a="auto"){await this.run(async()=>{if(this.state.uploads.length)throw new Error("\u8BF7\u7B49\u5F85\u6587\u4EF6\u4E0A\u4F20\u5B8C\u6210\uFF0C\u6216\u79FB\u9664\u5931\u8D25\u7684\u4E0A\u4F20\u3002");let n=this.state.draft,l=t.content===void 0,r=t.content??n.text.trim();if(a==="ask"&&(!l||!Js(n.sources))||!r)return;let o=await this.ensureThread(),i=this.epoch,u=this.state.jobs.find(k=>k.threadId===o.id&&!et(k)),c=!!t.questionReply,s=c?[]:n.sources.map(({type:k,id:g})=>({type:k,id:g})),f=JSON.stringify(a==="ask"?[o.id,r,s,a]:[o.id,r,n,t]),p=u?{delivery:a==="ask"||c?"after-current":n.delivery,expectedJobId:u.id}:{},d=this.storage.value("pending-submit",null);this.pendingSubmit?.signature!==f&&(this.pendingSubmit=d?.signature===f?d:{signature:f,key:ur(),body:a==="ask"?{content:r,sourceRefs:s,...p,executionMode:a,materialQuestion:!0}:{content:c?r:[...n.skills.map(k=>"/"+k),r].join(`
`),learningPattern:c?"":n.learningPattern,sourceRefs:s,artifactType:c?"auto":n.artifactType,candidateMode:"auto",candidateCount:3,...p,...t,executionMode:a}}),this.storage.set("pending-submit",this.pendingSubmit);let h=await this.mutateMessage(o.id,this.pendingSubmit);this.pendingSubmit=null,this.storage.set("pending-submit",null);let y=l&&this.state.draft===n?{...Xc(),mode:n.mode,learningPattern:n.learningPattern}:this.state.draft;this.storage.save(o.id,y),i===this.epoch&&this.state.thread?.id===o.id&&(this.patch({thread:h.thread||o,draft:y}),h.job&&(this.patch({jobs:[h.job,...this.state.jobs.filter(k=>k.id!==h.job.id)],selectedJob:h.job.id}),this.loadEvents(h.job.id).catch(this.error))),await this.loadThreads()})}async replaceMessage(t,a,n,l){let r=this.epoch,o=await this.mutate(`/threads/${pe(t)}/messages/${a}`,{content:n,expectedLastMessageId:l},"PATCH");if(r===this.epoch&&this.state.thread?.id===t){this.state.selectedFile&&!sr(o.thread.messages).some(u=>u.id===this.state.selectedFile?.id)&&this.togglePanel();let i=[...o.thread.harnessJobs||[]];o.job&&!i.some(u=>u.id===o.job.id)&&i.unshift(o.job),this.patch({thread:o.thread,jobs:[...i,...this.state.jobs.filter(u=>u.threadId!==t)],selectedJob:o.job?.id||null}),this.watchThread(t,++this.epoch),await this.loadJobs(t).catch(this.error)}this.loadThreads().catch(this.error)}mutateMessage(t,a){return Re(`/threads/${pe(t)}/messages`,{method:"POST",body:a.body,key:a.key})}async updateThread(t,a){await this.mutate(`/threads/${pe(t)}`,a,"PATCH"),await Promise.all([this.loadThreads(),this.state.thread?.id===t?this.refreshThread():Promise.resolve()])}async setScope(t,a){let n=await this.ensureThread();await this.updateThread(n.id,{dojoId:t?Number(t):null,moduleIndex:a!==void 0&&a!==""?Number(a):null})}async setReplyFeedback(t,a,n){let l=this.epoch;await Re(`/threads/${pe(t)}/messages/${a}/feedback`,{method:"PATCH",body:{value:n}}),await this.refreshThread(t,l)}async fork(t,a){let n=await this.mutate(`/threads/${pe(t)}/fork`,{sourceMessageId:a});await this.loadThreads(),await this.activate(n.thread.id),this.notify("\u5DF2\u521B\u5EFA\u5206\u652F\uFF0C\u53EF\u4EE5\u5C1D\u8BD5\u53E6\u4E00\u79CD\u65B9\u5411\u3002")}async editQueue(t,a,n){let l=await this.mutate(`/jobs/${pe(t)}/input`,{content:a,revision:n},"PATCH");l.thread?.id===this.state.thread?.id&&this.patch({thread:l.thread})}async cancel(t){await this.mutate(`/jobs/${pe(t)}`,{},"DELETE"),await Promise.all([this.loadJobs(),this.refreshThread()])}async retry(t){await this.mutate(`/jobs/${pe(t)}/retry`,{idempotencyKey:this.mutationKeys.get("retry:"+t)||this.retryToken(t)}),this.mutationKeys.delete("retry:"+t),delete this.cursor[t],this.patch({events:{...this.state.events,[t]:[]}}),await Promise.all([this.loadJobs(),this.refreshThread()]),this.selectJob(t)}retryToken(t){let a=ur();return this.mutationKeys.set("retry:"+t,a),a}async loadCatalog(t,a=!1){if(!a&&this.catalogLoaded.has(t))return;let n=await Re(t==="sources"?"/materials?limit=200":"/skills");this.patch(t==="sources"?{materials:n.materials||[]}:{skills:n.skills||n.catalog||[]}),this.catalogLoaded.add(t)}openCatalog(t){this.patch({modal:t}),this.loadCatalog(t).catch(this.error)}async upload(t){let a=await this.ensureThread(),n=this.epoch;for(let l of t){if(n!==this.epoch)break;let r=ur();this.patch({uploads:[...this.state.uploads,{id:r,name:l.name,state:"uploading"}]});try{let o=new FormData;o.set("file",l),o.set("threadId",a.id),o.set("conversationUpload","1"),o.set("stageOnly","1"),o.set("askIntent","0");let i=await Re("/materials",{method:"POST",body:o});if(!i.materialId)throw new Error("\u4E0A\u4F20\u672A\u8FD4\u56DE\u6587\u4EF6\u6807\u8BC6\uFF0C\u8BF7\u91CD\u8BD5\u3002");if(n!==this.epoch)break;this.setDraft({sources:[...this.state.draft.sources,{id:String(i.materialId),name:l.name,type:"material"}]}),this.patch({uploads:this.state.uploads.filter(u=>u.id!==r)}),this.catalogLoaded.delete("sources")}catch(o){n===this.epoch&&this.patch({uploads:this.state.uploads.map(i=>i.id===r?{...i,state:"error",error:o instanceof Error?o.message:"\u4E0A\u4F20\u672A\u5B8C\u6210"}:i)})}}}async loadArtifacts(){let t=await Re("/artifacts");this.patch({artifacts:t.artifacts||[]})}async loadArtifact(t){let a=await Re(`/artifacts/${pe(t)}`),n=this.state.artifactDetails[t],l=n&&n.currentRevision!==a.artifact.currentRevision;return this.patch({artifactDetails:{...this.state.artifactDetails,[t]:a.artifact},...l?{previews:{...this.state.previews,[t]:""}}:{}}),a.artifact}async openArtifact(t){this.patch({openArtifacts:[...new Set([...this.state.openArtifacts,t])],selectedArtifact:t}),this.setPanel("artifacts");let a=await this.loadArtifact(t),n=a.type==="simulation"&&a.revision?.content?.teachingWorkshop==="teaching-workshop-v1";this.state.selectedArtifact===t&&(Pc(a)||n)&&["DRAFT","READY","PUBLISHED"].includes(a.status)&&!this.state.previews[t]&&await this.launchPreview(a)}closeArtifact(t){let a=this.state.openArtifacts.filter(n=>n!==t);this.patch({openArtifacts:a,selectedArtifact:this.state.selectedArtifact===t?a.at(-1)||null:this.state.selectedArtifact})}async launchPreview(t){if(t.type==="learning-flow"){this.patch({previews:{...this.state.previews,[t.id]:`/teacher/artifacts/${pe(t.id)}?embed=1`}});return}let a=await this.mutate("/runtime/launch",{role:"teacher",dojoId:t.dojoId,moduleIndex:t.moduleIndex,target:`/prep/${pe(t.id)}`}),n=new URL(a.launchUrl,location.origin);if(!["http:","https:"].includes(n.protocol))throw new Error("\u9884\u89C8\u5730\u5740\u65E0\u6548\u3002");this.patch({previews:{...this.state.previews,[t.id]:n.href}})}async revise(t,a,n=!1){let l=await this.mutate(`/artifacts/${pe(t.id)}/revise`,{instruction:a,expectedRevision:t.currentRevision,...n?{useOriginalSpeakerNotes:!0}:{}});l.job&&this.patch({jobs:[l.job,...this.state.jobs.filter(r=>r.id!==l.job.id)],selectedJob:l.job.id}),this.notify("\u5C40\u90E8\u4FEE\u6539\u5DF2\u63D0\u4EA4\uFF0C\u539F\u7248\u672C\u4FDD\u7559\u3002"),await this.loadArtifact(t.id)}async restore(t,a){await this.mutate(`/artifacts/${pe(t.id)}/restore`,{sourceRevision:a,expectedRevision:t.currentRevision}),this.patch({previews:{...this.state.previews,[t.id]:""}}),await this.loadArtifact(t.id),this.notify("\u5DF2\u4ECE\u6240\u9009\u7248\u672C\u521B\u5EFA\u65B0\u8349\u7A3F\u3002")}async prepareClassroom(t,a,n,l){let r=this.state.thread;if(!r||r.id!==t||this.state.loadingThread)return;let o=this.epoch,i=()=>{let d=this.state.thread;return!this.stop&&!this.state.loadingThread&&this.epoch===o&&d?.id===t&&d.status==="ACTIVE"&&d.dojoId===r.dojoId&&d.moduleIndex===r.moduleIndex?d:null},u=()=>{let d=i(),h=d?.messages?.find(y=>y.id===a);return d&&h?Uc(d,h,n):null},c=u();if(!c)throw new Error("\u8BFE\u5802\u51C6\u5907\u7684\u8BFE\u4EF6\u3001\u8BFE\u7A0B\u8303\u56F4\u6216\u5BA1\u6279\u5DF2\u53D8\u66F4\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u63D0\u6848\u3002");if(c.sessionId||c.decision==="REJECTED")return;let s=JSON.stringify([t,a,n]);if(this.classroomActions.has(s))return;let f=`/threads/${pe(t)}/messages/${a}/tool-proposals/${n}`,p=(d,h)=>{let y=i(),k=u();if(!y||!k||k.approval.id!==c.approval.id||k.approval.sha256!==c.approval.sha256)return!1;let g=y.messages?.map(m=>m.id!==a?m:{...m,metadata:{...m.metadata,[d]:{...m.metadata[d],[String(n)]:h}}});return this.patch({thread:{...y,messages:g}}),!0};this.classroomActions.add(s);try{if(c.decision){if(l)return}else{if(!l)throw new Error("\u8BF7\u5148\u6279\u51C6\u8FD9\u9879\u8BFE\u5802\u51C6\u5907\u3002");let y=await this.mutate(f+"/decision",{decision:l,confirmed:!0,approvalRequest:c.approval});if(!i())return;if(!Lh(c.approval,y.decision)||y.decision.decision!==l)throw new Error("\u8BFE\u5802\u51C6\u5907\u672A\u8FD4\u56DE\u53EF\u9A8C\u8BC1\u7684\u5BA1\u6279\u8BB0\u5F55\uFF0C\u8BF7\u5237\u65B0\u540E\u67E5\u770B\u3002");if(!p("toolProposalDecisions",y.decision)||l==="REJECTED")return}let d=u();if(!d||d.decision!=="APPROVED"||d.sessionId||d.approval.id!==c.approval.id||d.approval.sha256!==c.approval.sha256)return;let h=await this.mutate(f+"/prepare-classroom",{approvalRequest:d.approval});if(!i())return;if(!vh(h.sessionId)||h.artifactId!==d.artifactId||h.artifactRevision!==d.revision)throw new Error("\u8BFE\u5802\u51C6\u5907\u672A\u8FD4\u56DE\u53EF\u9A8C\u8BC1\u7684\u4F1A\u8BDD\uFF0C\u53EF\u91CD\u8BD5\u539F\u8BF7\u6C42\u3002");p("toolExecutionResults",{tool:"classroom.prepare",status:"SUCCEEDED",sessionId:h.sessionId,artifactId:h.artifactId,artifactRevision:h.artifactRevision})}catch(d){if(!i())return;if(await this.refreshThread(t,o).catch(()=>{}),i())throw d}finally{this.classroomActions.delete(s)}}async approve(t,a,n){let l=this.state.thread?.id;l&&(await this.mutate(`/threads/${pe(l)}/messages/${t}/tool-proposals/${a}/decision`,{decision:n,confirmed:!0,approvalRequest:this.state.thread?.messages?.find(r=>r.id===t)?.metadata.toolProposalApprovalRequests?.[String(a)]}),await this.refreshThread(l))}async selectOption(t,a,n){let l=this.state.thread?.id;if(!l)return;let r={sourceMessageId:t,optionId:a},o=await this.mutate(`/threads/${pe(l)}/messages/${t}/generation-options/${pe(a)}/select`);if(o.proposal?.tool==="candidate.generate"){let i=o.proposal.arguments||{};await this.mutate(`/threads/${pe(l)}/messages`,{agentContinuation:!0,action:"generate",content:i.prompt,artifactType:i.artifactType,candidateMode:Number(i.candidateCount||1)>1?"multiple":"single",candidateCount:Number(i.candidateCount||1),sourceRefs:i.sourceRefs||[],generationSelection:r})}else if(o.proposal?.tool){if(o.proposal.tool==="challenge.generate"&&!n)throw new Error("\u8BF7\u5148\u5BA1\u9605\u5E76\u786E\u8BA4\u6BCF\u9053\u9898\u7684\u6807\u9898\u4E0E\u96BE\u5EA6\u3002");let i=await this.mutate("/agent-tools/execute",{threadId:l,tool:o.proposal.tool,arguments:o.proposal.arguments||{},confirmed:!!o.proposal.requiresConfirmation,sourceJobId:o.sourceJobId,generationSelection:r,generationPlan:n});if(i.action?.id){let u=i.action;for(let c=0;c<12&&["PENDING","QUEUED","RUNNING"].includes(u.status);c++)await new Promise(s=>setTimeout(s,700)),u=(await Re(`/agent-tools/actions/${pe(u.id)}`)).action;if(u.status==="FAILED")throw new Error(u.error||"\u65B9\u6848\u6267\u884C\u5931\u8D25\uFF0C\u53EF\u5728\u4EFB\u52A1\u4E2D\u5FC3\u7EE7\u7EED\u3002")}}await Promise.all([this.refreshThread(l),this.loadJobs()])}async saveAppearance(t,a){await bh("/users/settings",{method:"PATCH",body:{preferences:{appearance:t,palette:a}}}),window.AISecEduUI?.applyAppearance(t,a,!0),this.notify("\u5916\u89C2\u5DF2\u4FDD\u5B58\u3002")}};var K0=`:host {
  --canvas: var(--ui-bg);
  --rail: var(--ui-surface);
  --raised: var(--ui-surface-raised);
  --soft: var(--ui-field);
  --hover: var(--ui-surface-hover);
  --ink: var(--ui-text);
  --muted: var(--ui-text-muted);
  --line: var(--ui-border-soft);
  --border: var(--ui-border);
  --accent: var(--brand-green);
  --accent-soft: color-mix(in srgb, var(--brand-green) 10%, var(--ui-field));
  --teacher-bubble: color-mix(in srgb, var(--accent) 9%, var(--raised));
  --danger: var(--theme-danger);
  --success: var(--theme-success);
  --mono: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  color: var(--ink);
  font: inherit;
  font-size: 1rem;
  line-height: 1.6;
  text-align: left;
  -webkit-font-smoothing: antialiased;
}
* {
  box-sizing: border-box;
}
[hidden] {
  display: none !important;
}
button,
input,
textarea,
select {
  font: inherit;
  color: inherit;
}
button,
a,
input,
select,
textarea,
summary {
  -webkit-tap-highlight-color: transparent;
}
button {
  cursor: pointer;
  background: none;
  border: 0;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}
button:focus-visible,
a:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible,
summary:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
input,
textarea,
select {
  background: var(--ui-field);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 8px 10px;
  min-width: 0;
}
textarea {
  resize: vertical;
}
input::placeholder,
textarea::placeholder {
  color: var(--muted);
  opacity: 0.8;
}
a {
  color: var(--accent);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
svg {
  flex-shrink: 0;
  vertical-align: middle;
}
h1,
h2,
h3,
h4,
p {
  margin: 0;
}
h1 {
  font-size: clamp(1.6rem, 3vw, 2.15rem);
  font-weight: 600;
  line-height: 1.35;
}
h2 {
  font-size: 16px;
  font-weight: 600;
}
h3 {
  font-size: 14px;
  font-weight: 600;
}
h4 {
  font-size: var(--ae-type-caption);
}
small {
  font-size: var(--ae-type-caption);
}
code,
pre {
  font-family: var(--mono);
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 0;
}
summary {
  cursor: pointer;
}
fieldset {
  border: 0;
  padding: 0;
  margin: 0 0 16px;
  min-width: 0;
}
legend {
  padding: 0;
  font-size: 0.875rem;
  margin-bottom: 9px;
}
kbd {
  font-family: inherit;
  color: var(--muted);
  font-size: var(--ae-type-caption);
  white-space: nowrap;
}
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid transparent;
  border-radius: 7px;
  min-height: 38px;
  padding: 5px 10px;
  color: var(--ink);
  font-size: 0.875rem;
  line-height: 1.5;
  text-decoration: none;
}
.button:hover:not(:disabled) {
  background: var(--hover);
  text-decoration: none;
}
.button.primary {
  background: var(--accent);
  color: var(--theme-on-primary);
  font-weight: 550;
}
.button.primary:hover:not(:disabled) {
  background: var(--theme-primary-strong);
}
.button.selected,
.selected > .thread-link {
  color: var(--ink);
  background: var(--soft);
}
.icon-button {
  padding: 5px;
  width: 38px;
  height: 38px;
  min-height: 38px;
  flex-shrink: 0;
}
.push {
  margin-left: auto;
}
.quiet {
  color: var(--muted);
  font-size: var(--ae-type-caption);
}
.button-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.spin {
  animation: spin 1.3s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
#workbench-root {
  height: 100%;
}
.workbench {
  --sidebar-width: 286px;
  display: grid;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--canvas);
}
.workbench.has-panel {
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr) 4px minmax(340px, min(var(--panel-width), 48vw));
}
.workbench.sidebar-collapsed {
  --sidebar-width: 0px;
}
.sidebar-collapsed > .sidebar {
  display: none;
}
.sidebar {
  display: flex;
  flex-direction: column;
  background: var(--rail);
  min-height: 0;
  border-right: 1px solid var(--line);
  padding: 0;
}
.agent-mark {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  place-items: center;
  border-radius: 8px;
  color: var(--theme-on-primary);
  background: var(--accent);
}
.sidebar-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 12px 10px;
  border-bottom: 1px solid var(--line);
}
.sidebar-actions .button {
  width: 100%;
  justify-content: flex-start;
  gap: 10px;
  min-height: 42px;
  font-weight: 500;
}
.sidebar-actions .new-thread {
  background: var(--canvas);
  border-color: var(--border);
  margin: 0 0 8px;
  box-shadow: none;
  min-height: 44px;
  border-radius: 8px;
}
.sidebar-actions kbd {
  margin-left: auto;
}
.sidebar-actions .thread-search {
  margin-bottom: 8px;
  border-color: var(--line);
  border-radius: 8px;
  background: var(--soft);
  color: var(--muted);
}
.sidebar-actions svg {
  color: var(--accent);
}
.count {
  margin-left: auto;
  background: var(--accent-soft);
  color: var(--accent);
  min-width: 19px;
  text-align: center;
  border-radius: 5px;
  font-size: var(--ae-type-caption);
}
.sidebar-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 5px;
  color: var(--muted);
}
.sidebar-section-heading .button {
  color: var(--muted);
  font-size: var(--ae-type-caption);
  padding-left: 3px;
}
.thread-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 7px 14px;
  scrollbar-width: thin;
}
.thread-list section > h3 {
  font-size: var(--ae-type-caption);
  font-weight: 500;
  color: var(--muted);
  padding: 14px 9px 6px;
}
.thread-row {
  position: relative;
  display: flex;
  align-items: center;
  border-radius: 7px;
  margin: 1px 0;
}
.thread-row:hover,
.thread-row.selected {
  background: var(--hover);
}
.thread-link {
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  min-width: 0;
  flex: 1;
  padding: 8px 34px 8px 9px;
  min-height: 66px;
  border-radius: 7px;
  font-size: var(--ae-type-caption);
}
.thread-link > span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.thread-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.thread-copy strong,
.thread-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.thread-copy strong {
  font-weight: 620;
  padding-right: 34px;
}
.thread-copy small,
.thread-link time {
  color: var(--muted);
  font-size: var(--ae-type-caption);
}
.thread-link time {
  position: absolute;
  top: 8px;
  right: 9px;
  max-width: 56px;
  overflow: hidden;
  white-space: nowrap;
}
.thread-link svg {
  color: var(--muted);
}
.thread-more {
  position: absolute;
  right: 5px;
  bottom: 6px;
  height: 26px;
  min-height: 26px;
  background: var(--hover);
  opacity: 0;
  width: 26px;
  min-height: 26px;
  height: 26px;
  margin-right: 3px;
}
.thread-row:hover .thread-more,
.thread-row:focus-within .thread-more,
.thread-row.selected .thread-more {
  opacity: 1;
}
.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
  margin-left: auto;
}
.thread-menu {
  position: absolute;
  top: 35px;
  right: 0;
  min-width: 158px;
  z-index: 5;
  padding: 5px;
  background: var(--canvas);
  border: 1px solid var(--border);
  border-radius: 9px;
  box-shadow: 0 8px 24px var(--ui-shadow);
}
.thread-menu .button {
  display: flex;
  width: 100%;
  justify-content: flex-start;
}
.sidebar-empty {
  padding: 10px;
}
.main-pane {
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}
.workspace-header {
  min-height: 66px;
  flex-shrink: 0;
  padding: 9px 18px;
  background: var(--rail);
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  gap: 10px;
}
.workspace-breadcrumb {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  font-size: 1rem;
}
.workspace-breadcrumb > span {
  color: var(--muted);
  white-space: nowrap;
}
.workspace-breadcrumb > svg {
  color: var(--muted);
}
.workspace-breadcrumb strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 550;
}
.header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 3px;
}
.offline {
  color: var(--theme-warning);
  display: flex;
  gap: 5px;
  align-items: center;
  font-size: var(--ae-type-caption);
  white-space: nowrap;
}
.notice {
  background: var(--accent-soft);
  color: var(--accent);
  padding: 7px 16px;
  font-size: var(--ae-type-caption);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-shrink: 0;
}
.notice.error {
  background: color-mix(in srgb, var(--danger) 9%, var(--canvas));
  color: var(--danger);
}
.notice span {
  overflow-wrap: anywhere;
}
.workspace-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--muted);
}
.welcome {
  width: 100%;
  margin: 0 auto;
  padding: 30px 20px;
  max-width: 900px;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
}
.welcome-heading {
  margin: 0 0 28px;
}
.welcome-symbol {
  color: var(--accent);
  display: block;
  margin: 0 0 18px;
}
.welcome h1 {
  letter-spacing: -0.5px;
  font-size: clamp(1.6rem, 3vw, 2.15rem);
}
.welcome-heading p {
  color: var(--muted);
  font-size: 1rem;
  line-height: 1.7;
  margin-top: 10px;
}
.composer-area {
  padding: 9px clamp(16px, 4vw, 52px) 11px;
  width: 100%;
  flex-shrink: 0;
  border-top: 1px solid var(--line);
  background: var(--rail);
}
.composer-area > * {
  width: min(100%, 900px);
  margin-right: auto;
  margin-left: auto;
}
.composer {
  position: relative;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--ui-field);
  box-shadow: 0 3px 12px var(--ui-shadow);
}
.composer:focus-within {
  border-color: color-mix(in srgb, var(--accent) 65%, var(--border));
}
.composer.dragging {
  border: 2px dashed var(--accent);
  background: var(--accent-soft);
}
.composer textarea {
  display: block;
  padding: 14px 64px 8px 14px;
  min-height: 58px;
  width: 100%;
  max-height: 200px;
  border: 0;
  background: transparent;
  outline: none;
  resize: none;
  font-size: 1rem;
  line-height: 1.55;
  box-shadow: none;
}
#workbench-prompt:focus,
#workbench-prompt:focus-visible {
  outline: 0 !important;
  outline-offset: 0;
  box-shadow: none !important;
}
.composer-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px 8px;
  min-height: 38px;
  flex-wrap: wrap;
}
.composer-toolbar .teaching-project-button {
  min-height: 32px;
  padding: 4px 8px;
  font-size: var(--ae-type-caption);
}
.composer-toolbar select {
  border: 0;
  padding: 5px 3px;
  font-size: var(--ae-type-caption);
  background: transparent;
  max-width: 118px;
}
.add-context {
  position: relative;
}
.composer-menu {
  position: absolute;
  bottom: 38px;
  left: -1px;
  z-index: 4;
  background: var(--canvas);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 5px;
  width: 168px;
  box-shadow: 0 8px 24px var(--ui-shadow);
}
.composer-menu .button {
  width: 100%;
  justify-content: flex-start;
}
.button.send-button {
  position: absolute;
  bottom: 44px;
  right: 8px;
  background: var(--accent);
  color: var(--theme-on-primary);
  border-radius: 8px;
  width: 42px;
  height: 42px;
  padding: 5px;
  flex-shrink: 0;
}
.button.send-button:disabled {
  background: var(--accent);
  color: var(--theme-on-primary);
  opacity: 0.55;
}
.stop-button {
  background: var(--soft);
}
.composer-footnote {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin: 9px 3px 0;
  font-size: var(--ae-type-caption);
  color: var(--muted);
}
.composer-footnote > span:first-child:not(:last-child) {
  margin-right: auto;
}
.composer-footnote > span:last-child {
  white-space: nowrap;
}
.context-chips {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  padding: 11px 12px 0;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--line);
  background: var(--raised);
  border-radius: 6px;
  color: var(--muted);
  padding: 2px 5px 2px 7px;
  font-size: var(--ae-type-caption);
  max-width: 100%;
}
.chip > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 190px;
}
.chip .icon-button {
  width: 20px;
  height: 20px;
  min-height: 20px;
  padding: 2px;
}
.chip.error {
  color: var(--danger);
}
.starter-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 25px 0 45px;
  gap: 8px;
}
.starter-grid .button {
  text-align: left;
  padding: 12px 10px;
  justify-content: flex-start;
  align-items: flex-start;
  gap: 8px;
  border: 1px solid var(--line);
  background: var(--raised);
  border-radius: 10px;
}
.starter-grid svg {
  margin-top: 3px;
  width: 34px;
  height: 34px;
  padding: 8px;
  border-radius: 7px;
  color: var(--accent);
  background: var(--accent-soft);
}
.starter-grid strong,
.starter-grid small {
  display: block;
}
.starter-grid strong {
  font-size: var(--ae-type-caption);
  font-weight: 550;
}
.starter-grid small {
  margin-top: 3px;
  color: var(--muted);
  font-size: var(--ae-type-caption);
}
.recent-work > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--line);
  padding-bottom: 10px;
}
.recent-work h2 {
  font-size: var(--ae-type-caption);
  color: var(--muted);
  font-weight: 500;
}
.recent-work header .button {
  font-size: var(--ae-type-caption);
  color: var(--muted);
}
.recent-work > button {
  width: 100%;
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--line);
  text-align: left;
}
.recent-work > button:hover {
  background: var(--raised);
}
.recent-work strong {
  font-size: var(--ae-type-caption);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.recent-work button > span,
.recent-work small {
  font-size: var(--ae-type-caption);
  color: var(--muted);
  white-space: nowrap;
}
.recent-work > p {
  margin: 16px 0;
}
.conversation {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}
.transcript-scroll {
  flex: 1;
  overflow: auto;
  min-height: 0;
  scrollbar-width: thin;
}
.transcript {
  max-width: 872px;
  margin: 0 auto;
  padding: 32px clamp(16px, 4vw, 46px) 24px;
}
.conversation-time-divider {
  display: flex;
  justify-content: center;
  margin: 30px 0 25px;
  padding: 0 12px;
  color: var(--muted);
  font-size: var(--ae-type-caption);
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
}
.transcript > :first-child .conversation-time-divider {
  margin-top: 1px;
}
.message {
  margin-bottom: 28px;
}
.user-message {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  justify-items: end;
}
.message-body {
  min-width: 0;
}
.user-message[data-editing='true'] .message-body {
  width: min(100%, 640px);
  max-width: 90%;
}
.message-editor {
  display: grid;
  gap: 10px;
  padding: 13px;
  border: 1px solid var(--border);
  border-radius: 16px 5px 16px 16px;
  background: var(--raised);
}
.message-editor textarea {
  width: 100%;
  min-height: 86px;
  max-height: min(38vh, 380px);
  padding: 10px 11px;
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow-wrap: anywhere;
  font-size: 1rem;
  line-height: 1.6;
}
.message-editor-note,
.message-editor-error {
  margin: 0;
  color: var(--muted);
  font-size: var(--ae-type-caption);
}
.message-editor-error {
  color: var(--danger);
}
.message-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.message-body > .markdown {
  max-width: 71ch;
  padding: 1px 0;
}
.user-message .message-body {
  width: fit-content;
  max-width: min(82%, 67ch);
  padding: 0 0 0 12px;
}
.user-message .message-body > .markdown {
  background: var(--teacher-bubble);
  border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--line));
  border-radius: 16px 5px 16px 16px;
  padding: 11px 15px;
}
.user-message .message-actions {
  justify-content: flex-end;
  margin-top: 5px;
}
.user-message .message-actions time {
  margin-right: 3px;
}
.message[data-show-actions='true'] .message-actions,
.message-actions:has(:focus-visible),
.message-actions:has([aria-expanded='true']) {
  opacity: 1;
  pointer-events: auto;
}
@media (hover: hover) {
  .message-body:hover .message-actions {
    opacity: 1;
    pointer-events: auto;
  }
}
.markdown {
  overflow-wrap: anywhere;
  line-height: 1.7;
  font-size: 0.9375rem;
}
.markdown p {
  margin: 0 0 12px;
}
.markdown p:last-child {
  margin-bottom: 0;
}
.markdown ul,
.markdown ol {
  margin: 8px 0 15px;
  padding-left: 22px;
}
.markdown li {
  margin: 4px 0;
}
.markdown h1,
.markdown h2,
.markdown h3 {
  margin: 20px 0 10px;
  line-height: 1.5;
}
.markdown h1 {
  font-size: 20px;
}
.markdown h2 {
  font-size: 17px;
}
.markdown h3 {
  font-size: 15px;
}
.markdown pre {
  background: var(--soft);
  padding: 13px 15px;
  border: 1px solid var(--line);
  border-radius: 8px;
  margin: 12px 0;
  font-size: var(--ae-type-caption);
  line-height: 1.7;
}
.markdown :not(pre) > code {
  background: var(--soft);
  border-radius: 4px;
  padding: 2px 4px;
  font-size: 0.93em;
}
.markdown blockquote {
  margin: 14px 0;
  padding: 5px 14px;
  border-left: 3px solid var(--border);
  color: var(--muted);
}
.markdown table {
  display: block;
  width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: var(--ae-type-caption);
}
.markdown td,
.markdown th {
  padding: 7px 10px;
  border: 1px solid var(--line);
}
.markdown th {
  background: var(--raised);
}
.markdown hr {
  border: 0;
  border-top: 1px solid var(--line);
  margin: 20px 0;
}
.tag {
  color: var(--muted);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0 5px;
  font-size: var(--ae-type-caption);
}
.message-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  margin: 8px 0 0;
  color: var(--muted);
  opacity: 0;
  pointer-events: none;
}
.message-actions[hidden] {
  display: none;
}
.message-actions time {
  font-size: var(--ae-type-caption);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.assistant-message .message-actions time {
  margin-left: 4px;
}
.message-actions .icon-button {
  width: 28px;
  height: 28px;
  min-height: 28px;
  color: inherit;
}
.message-actions .icon-button[aria-pressed='true'] {
  color: var(--accent);
  background: var(--soft);
}
.message-actions .icon-button[aria-pressed='true'] svg {
  fill: color-mix(in srgb, var(--accent) 18%, transparent);
}
.reply-more {
  position: relative;
}
.reply-menu {
  position: absolute;
  z-index: 3;
  bottom: calc(100% + 5px);
  inset-inline-start: 0;
  display: grid;
  width: max-content;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--raised);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--ink) 14%, transparent);
}
.reply-menu .button {
  justify-content: flex-start;
  text-align: start;
}
@media (pointer: coarse) {
  .message-actions .icon-button {
    width: 34px;
    height: 34px;
  }
}
.run-summary {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 33px;
  text-align: left;
  padding: 5px 0;
  color: var(--muted);
  margin: 1px 0 10px;
  font-size: var(--ae-type-caption);
}
.run-summary > span:nth-child(2) {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.run-summary:hover {
  color: var(--accent);
}
.status {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  font-size: var(--ae-type-caption);
  white-space: nowrap;
  color: var(--muted);
}
.status.running {
  color: var(--accent);
}
.status.failed {
  color: var(--danger);
}
.status.done {
  color: var(--success);
}
.pending-text {
  padding: 10px 0;
}
.plan-block {
  margin: 0 0 15px;
  padding: 0 0 10px;
  border-bottom: 1px solid var(--line);
}
.plan-block summary {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: var(--ae-type-caption);
}
.plan-block summary span {
  margin-left: auto;
  font-size: var(--ae-type-caption);
}
.plan-block ol {
  font-size: var(--ae-type-caption);
  margin: 12px 0 0;
  padding-left: 20px;
}
.plan-block li {
  margin: 5px 0;
}
.options-block,
.question-block,
.approval-block {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 15px;
  margin-top: 18px;
  background: var(--raised);
}
.options-block > header {
  display: flex;
  gap: 7px;
  align-items: center;
  font-size: var(--ae-type-caption);
}
.options-block > header > span {
  margin-left: auto;
  font-size: var(--ae-type-caption);
}
.option-tabs {
  display: flex;
  gap: 4px;
  margin: 15px 0;
  border-bottom: 1px solid var(--line);
}
.option-tabs button {
  flex: 1;
  padding: 8px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 5px;
  font-size: var(--ae-type-caption);
  border-bottom: 2px solid transparent;
}
.option-tabs button[aria-selected='true'] {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.option-content h3 {
  font-size: 15px;
  margin-bottom: 8px;
}
.option-content p,
.option-content ul {
  font-size: var(--ae-type-caption);
  line-height: 1.8;
  color: var(--muted);
}
.option-content ul {
  padding-left: 20px;
  margin: 8px 0;
}
.option-content details,
.approval-block details {
  margin: 14px 0;
  font-size: var(--ae-type-caption);
}
.option-content details .markdown {
  padding-top: 12px;
  font-size: var(--ae-type-caption);
}
.refine-options {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  font-size: var(--ae-type-caption);
}
.refine-options textarea {
  display: block;
  width: 100%;
  margin: 10px 0;
}
.question-block { max-width: 660px; border-color: color-mix(in srgb, var(--accent) 36%, var(--line)); padding: 14px; }
.question-header { display: flex; justify-content: space-between; color: var(--accent); font-size: 0.82rem; }
.question-header span { color: var(--muted); font-variant-numeric: tabular-nums; }
.question-block fieldset { border: 0; padding: 0; margin: 10px 0 0; min-width: 0; }
.question-block legend { font-size: 1rem; line-height: 1.44; font-weight: 640; margin-bottom: 12px; }
.question-block textarea { width: 100%; margin-top: 8px; }
.question-block footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 13px; }
.question-custom { color: var(--accent); padding: 6px 3px; font-size: .875rem; }
.question-complete { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: .82rem; margin: 8px 0; }
.choice-list {
  display: grid;
  gap: 6px;
}
.choice-list button {
  display: flex;
  align-items: center;
  text-align: left;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  background: var(--rail);
  border-radius: 8px;
  font-size: .9rem;
}
.choice-list button:hover { border-color: var(--accent); }
.choice-list small { color: var(--muted); display: block; line-height: 1.35; }
.choice-indicator { width: 18px; height: 18px; border: 1px solid var(--border); border-radius: 50%; flex: none;
  display: grid; place-items: center; color: var(--accent); }
.choice-list .selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.approval-block {
  border-color: color-mix(in srgb, var(--theme-warning) 45%, var(--border));
}
.approval-block h3 {
  display: flex;
  gap: 7px;
  align-items: center;
  color: var(--theme-warning);
  margin-bottom: 8px;
}
.approval-block p {
  font-size: var(--ae-type-caption);
}
.result-card {
  display: flex;
  gap: 13px;
  align-items: center;
  text-align: left;
  width: 100%;
  max-width: 610px;
  padding: 14px;
  margin-top: 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--raised);
}
.result-card:hover {
  border-color: var(--accent);
}
.result-card > svg:first-child {
  color: var(--accent);
}
.result-card > span {
  flex: 1;
  min-width: 0;
}
.result-card > .result-glyph {
  flex: none;
  width: 39px;
  height: 39px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  color: var(--accent);
  background: var(--accent-soft);
}
.result-card small,
.result-card strong,
.result-card span > span {
  display: block;
}
.result-card small,
.result-card span > span {
  font-size: var(--ae-type-caption);
  color: var(--muted);
}
.result-card strong {
  font-size: 0.875rem;
  margin: 3px 0;
}
.file-result {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--ae-type-caption);
  padding: 8px;
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: 7px;
  margin: 8px 0;
}
.jump-latest {
  position: absolute;
  bottom: 180px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--canvas);
  border: 1px solid var(--border);
  border-radius: 20px;
  box-shadow: 0 3px 12px var(--ui-shadow);
  font-size: var(--ae-type-caption);
}
.queue-dock {
  border: 1px solid var(--line);
  border-bottom: 0;
  border-radius: 12px 12px 0 0;
  margin: 0 8px -4px;
  padding: 8px 8px 12px;
  background: var(--raised);
  max-height: 220px;
  overflow-y: auto;
}
.queue-row {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 5px;
}
.queue-row > svg {
  margin-top: 4px;
  color: var(--muted);
}
.queue-row > div {
  flex: 1;
  min-width: 0;
}
.queue-row small {
  color: var(--muted);
  font-size: var(--ae-type-caption);
}
.queue-row p {
  font-size: var(--ae-type-caption);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.queue-row textarea {
  width: 100%;
  font-size: var(--ae-type-caption);
}
.archive-notice {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.panel-resizer {
  width: 4px;
  background: var(--line);
  cursor: col-resize;
  touch-action: none;
  z-index: 3;
}
.panel-resizer:hover,
.panel-resizer:focus-visible {
  background: var(--accent);
}
.work-area {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: var(--canvas);
}
.panel-header {
  display: flex;
  align-items: center;
  height: 56px;
  flex-shrink: 0;
  padding: 0 10px;
  gap: 2px;
  border-bottom: 1px solid var(--line);
}
.panel-header > div {
  display: flex;
  align-items: stretch;
  gap: 4px;
  flex: 1;
  height: 100%;
}
.panel-header [role='tab'] {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  border-bottom: 2px solid transparent;
  font-size: var(--ae-type-caption);
  color: var(--muted);
}
.panel-header [aria-selected='true'] {
  border-bottom-color: var(--accent);
  color: var(--ink);
}
.panel-content {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.panel-scroll {
  min-height: 0;
  overflow-y: auto;
  flex: 1;
  scrollbar-width: thin;
}
.panel-note {
  color: var(--muted);
  font-size: var(--ae-type-caption);
  border-top: 1px solid var(--line);
  padding: 9px 14px;
  flex-shrink: 0;
}
.expanded-panel .work-area {
  position: absolute;
  inset: 0 0 0 var(--sidebar-width);
  z-index: 8;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
  padding: 35px 28px;
  margin: auto;
  min-height: 250px;
}
.empty-state > svg {
  color: var(--muted);
}
.empty-state > strong {
  font-size: 14px;
  font-weight: 550;
}
.empty-state > div {
  color: var(--muted);
  font-size: var(--ae-type-caption);
  max-width: 280px;
}
.empty-state .button {
  margin-top: 18px;
}
.artifact-panel,
.artifact-workspace,
.activity-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
.artifact-tabs {
  display: flex;
  gap: 0;
  align-items: stretch;
  min-height: 38px;
  overflow-x: auto;
  border-bottom: 1px solid var(--line);
  background: var(--rail);
  flex-shrink: 0;
  scrollbar-width: thin;
}
.artifact-tabs > button,
.artifact-tabs > div {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  border-right: 1px solid var(--line);
}
.artifact-tabs [role='tab'] {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--ae-type-caption);
  padding: 8px 12px;
  max-width: 190px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--muted);
}
.artifact-tabs .active,
.artifact-tabs > button[aria-selected='true'] {
  background: var(--canvas);
}
.artifact-tabs [aria-selected='true'] {
  color: var(--ink);
}
.artifact-tabs .icon-button {
  margin-right: 3px;
  width: 22px;
  height: 22px;
  min-height: 22px;
}
.artifact-library {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.search-field {
  display: flex;
  gap: 7px;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--canvas);
  padding: 0 9px;
  color: var(--muted);
}
.search-field input {
  border: 0;
  outline: none;
  background: transparent;
  width: 100%;
  padding: 8px 0;
  font-size: var(--ae-type-caption);
}
.artifact-library > .search-field {
  margin: 14px;
}
.artifact-list-row {
  display: flex;
  width: 100%;
  align-items: center;
  text-align: left;
  gap: 11px;
  padding: 15px;
  border-bottom: 1px solid var(--line);
}
.artifact-list-row:hover {
  background: var(--raised);
}
.artifact-list-row > span:nth-child(2) {
  flex: 1;
  min-width: 0;
}
.artifact-list-row strong {
  display: block;
  font-size: var(--ae-type-caption);
  font-weight: 550;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.artifact-list-row small {
  display: block;
  font-size: var(--ae-type-caption);
  color: var(--muted);
  margin-top: 5px;
}
.file-icon {
  display: grid;
  place-items: center;
  width: 33px;
  height: 40px;
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--accent);
}
.artifact-title {
  display: flex;
  gap: 9px;
  align-items: center;
  padding: 15px;
  border-bottom: 1px solid var(--line);
}
.artifact-title > div {
  flex: 1;
  min-width: 0;
}
.artifact-title strong {
  font-size: 0.875rem;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.artifact-title small {
  display: block;
  color: var(--muted);
  font-size: var(--ae-type-caption);
  margin-top: 3px;
}
.artifact-subtabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 11px;
  height: 38px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.artifact-subtabs > button[role='tab'] {
  display: flex;
  gap: 5px;
  align-items: center;
  color: var(--muted);
  padding: 9px;
  font-size: var(--ae-type-caption);
  height: 100%;
  border-bottom: 2px solid transparent;
}
.artifact-subtabs > button[aria-selected='true'] {
  color: var(--accent);
  border-color: var(--accent);
}
.artifact-subtabs > .icon-button {
  margin-left: auto;
}
.artifact-content {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}
.preview-area {
  flex: 1;
  min-height: 0;
  display: flex;
  background: var(--rail);
}
.preview-area iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--canvas);
}
.source-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.source-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--ae-type-caption);
  color: var(--muted);
  padding: 8px 12px;
  background: var(--raised);
  border-bottom: 1px solid var(--line);
}
.source-editor {
  flex: 1;
  width: 100%;
  min-height: 0;
  border: 0;
  border-radius: 0;
  resize: none;
  font: 11px/1.8 var(--mono);
  background: var(--canvas);
  color: var(--ink);
  padding: 15px;
  tab-size: 2;
  white-space: pre;
  overflow: auto;
}
.history-area {
  overflow-y: auto;
  min-height: 0;
  flex: 1;
}
.revision-row {
  padding: 14px;
  display: flex;
  gap: 9px;
  align-items: center;
  border-bottom: 1px solid var(--line);
}
.revision-badge {
  font-size: var(--ae-type-caption);
  padding: 3px 7px;
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 5px;
}
.revision-row > div {
  flex: 1;
  min-width: 0;
}
.revision-row strong {
  display: block;
  font-size: var(--ae-type-caption);
  font-weight: 500;
  overflow-wrap: anywhere;
  max-height: 48px;
  overflow: hidden;
}
.revision-row small {
  font-size: var(--ae-type-caption);
  color: var(--muted);
}
.revision-row .button {
  font-size: var(--ae-type-caption);
}
.revision-compare > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  font-size: var(--ae-type-caption);
  border-bottom: 1px solid var(--line);
}
.diff-view {
  font-size: var(--ae-type-caption);
  line-height: 1.6;
}
.diff-view pre {
  display: flex;
  gap: 6px;
  padding: 3px 9px;
}
.diff-view pre > span {
  flex: 0 0 10px;
  user-select: none;
}
.diff-view code {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.diff-added {
  background: color-mix(in srgb, var(--success) 12%, var(--canvas));
  color: var(--success);
}
.diff-removed {
  background: color-mix(in srgb, var(--danger) 10%, var(--canvas));
  color: var(--danger);
}
.diff-same {
  color: var(--muted);
}
.diff-large {
  padding: 12px;
}
.revision-composer {
  border-top: 1px solid var(--line);
  padding: 12px 14px;
  flex-shrink: 0;
}
.revision-context {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  font-size: var(--ae-type-caption);
}
.revision-context > span {
  color: var(--muted);
}
.revision-input {
  display: flex;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 5px;
  align-items: flex-end;
  gap: 5px;
  background: var(--ui-field);
}
.revision-input textarea {
  resize: vertical;
  min-height: 56px;
  max-height: 160px;
  border: 0;
  padding: 6px;
  flex: 1;
  font-size: var(--ae-type-caption);
  outline: none;
  background: transparent;
}
.revision-composer > small {
  font-size: var(--ae-type-caption);
  color: var(--muted);
  margin-top: 7px;
  display: block;
}
.panel-toolbar {
  display: flex;
  padding: 10px;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--line);
}
.panel-toolbar select {
  flex: 1;
  font-size: var(--ae-type-caption);
  border-color: var(--line);
}
.activity-job {
  padding: 13px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  font-size: var(--ae-type-caption);
  color: var(--muted);
}
.activity-job > progress {
  width: 100%;
  height: 4px;
  accent-color: var(--accent);
}
.activity-filters {
  display: flex;
  gap: 6px;
  align-items: center;
  border-bottom: 1px solid var(--line);
  padding: 0 11px 10px;
}
.activity-filters > svg {
  color: var(--muted);
}
.activity-filters select,
.activity-filters input {
  font-size: var(--ae-type-caption);
  padding: 5px;
  border-color: var(--line);
}
.activity-filters select {
  max-width: 120px;
}
.activity-filters input {
  flex: 1;
  width: 70px;
}
.activity-row {
  border-bottom: 1px solid var(--line);
}
.activity-row > summary {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 13px;
}
.activity-row > summary:hover {
  background: var(--raised);
}
.activity-row > summary > svg {
  margin-top: 3px;
  color: var(--muted);
}
.activity-row > summary > span:nth-child(2) {
  flex: 1;
  min-width: 0;
}
.activity-row strong {
  display: block;
  font-size: var(--ae-type-caption);
  font-weight: 500;
}
.activity-row summary code {
  display: block;
  color: var(--muted);
  font-size: var(--ae-type-caption);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.activity-row summary > .status {
  font-size: var(--ae-type-caption);
  padding-top: 2px;
}
.activity-detail {
  margin: 0 12px 13px 36px;
  font-size: var(--ae-type-caption);
}
.activity-detail h4 {
  font-size: var(--ae-type-caption);
  color: var(--muted);
  margin: 12px 0 5px;
}
.code {
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 10px;
  font-size: var(--ae-type-caption);
  line-height: 1.7;
  max-height: 420px;
  overflow: auto;
}
.command-line {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  padding: 9px 0;
}
.command-line code {
  flex: 1;
  overflow-wrap: anywhere;
  font-size: var(--ae-type-caption);
}
.exit-code {
  color: var(--muted);
  font-size: var(--ae-type-caption);
  margin-top: 8px;
}
.context-panel {
  padding: 22px 20px;
}
.section-heading {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.section-heading h2 {
  font-size: 14px;
}
.context-panel > section {
  border-bottom: 1px solid var(--line);
  padding: 24px 0;
}
.context-panel section > header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.context-panel h3 {
  margin-bottom: 12px;
  font-size: var(--ae-type-caption);
  display: flex;
  gap: 6px;
  align-items: center;
}
.context-panel section > p {
  margin: 8px 0 12px;
}
.context-item {
  display: flex;
  gap: 7px;
  align-items: center;
  padding: 8px 0;
  font-size: var(--ae-type-caption);
}
.context-item > span {
  flex: 1;
  overflow-wrap: anywhere;
}
.context-panel > a {
  margin-top: 17px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: var(--ae-type-caption);
  color: var(--muted);
  margin: 14px 0;
}
.field input,
.field select {
  color: var(--ink);
  width: 100%;
}
.task-center {
  padding: 35px 28px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.task-center > header > div {
  display: flex;
  gap: 11px;
  align-items: center;
}
.task-center h1 {
  font-size: 22px;
}
.task-center header p {
  color: var(--muted);
  font-size: var(--ae-type-caption);
  margin-top: 10px;
  max-width: 560px;
}
.task-filters {
  display: flex;
  gap: 14px;
  align-items: center;
  margin: 28px 0 18px;
  flex-wrap: wrap;
}
.segmented {
  display: flex;
  gap: 3px;
  background: var(--rail);
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 8px;
}
.segmented button {
  padding: 5px 10px;
  font-size: var(--ae-type-caption);
  border-radius: 5px;
  color: var(--muted);
}
.segmented button[aria-pressed='true'] {
  background: var(--canvas);
  box-shadow: 0 1px 3px var(--ui-shadow);
  color: var(--ink);
}
.task-filters .search-field {
  flex: 1;
  min-width: 150px;
}
.task-row {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 18px 0;
  border-bottom: 1px solid var(--line);
}
.task-icon {
  color: var(--muted);
  padding-top: 2px;
}
.task-info {
  flex: 1;
  min-width: 0;
}
.task-info strong {
  display: block;
  font-size: 0.875rem;
  font-weight: 550;
}
.task-info p {
  font-size: var(--ae-type-caption);
  color: var(--muted);
  margin: 5px 0;
  overflow-wrap: anywhere;
}
.task-info small {
  color: var(--muted);
  font-size: var(--ae-type-caption);
}
.task-info details {
  font-size: var(--ae-type-caption);
  margin-top: 10px;
}
.task-info pre {
  color: var(--danger);
  padding-top: 9px;
}
.task-actions {
  display: flex;
  gap: 2px;
}
.task-limit {
  margin-top: 15px;
  font-size: var(--ae-type-caption);
}
.modal-layer {
  position: fixed;
  inset: 0;
  background: var(--ui-overlay);
  z-index: 30;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: min(12vh, 100px) 16px 30px;
  overflow-y: auto;
}
.dialog {
  background: var(--rail);
  border: 1px solid var(--border);
  width: 520px;
  max-width: 100%;
  border-radius: 8px;
  box-shadow: 0 24px 70px var(--ui-shadow);
  max-height: 82dvh;
  display: flex;
  flex-direction: column;
}
.dialog.wide {
  width: 840px;
}
.dialog > header {
  background: var(--raised);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.dialog > header h2 {
  font-size: 14px;
}
.dialog > form {
  padding: 5px 20px 0;
}
.dialog-body {
  padding: 20px;
  overflow-y: auto;
  font-size: 0.875rem;
}
.dialog-body > h3 {
  margin-bottom: 14px;
}
.dialog-body > p {
  margin-bottom: 10px;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 9px;
  padding: 14px 18px;
  border-top: 1px solid var(--line);
}
.dialog-actions > .quiet {
  margin-right: auto;
}
.command-search {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 18px;
  color: var(--muted);
  flex-shrink: 0;
}
.command-search input {
  border: 0;
  outline: none;
  flex: 1;
  background: transparent;
  font-size: 14px;
  padding: 8px 0;
}
.command-results {
  padding: 0 9px 14px;
  overflow-y: auto;
}
.command-results h3 {
  color: var(--muted);
  font-weight: 500;
  font-size: var(--ae-type-caption);
  padding: 14px 10px 7px;
}
.command-results .button {
  display: flex;
  width: 100%;
  justify-content: flex-start;
  text-align: left;
  padding: 9px 10px;
}
.command-results .button > span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.command-results kbd {
  margin-left: auto;
}
.catalog-list {
  overflow-y: auto;
  padding: 0 12px 16px;
}
.catalog-item {
  display: flex;
  gap: 11px;
  align-items: center;
  width: 100%;
  border-radius: 8px;
  padding: 12px;
  text-align: left;
}
.catalog-item:hover {
  background: var(--raised);
}
.catalog-item.selected {
  background: var(--accent-soft);
}
.catalog-item > span:first-of-type {
  flex: 1;
  min-width: 0;
}
.catalog-item strong {
  display: block;
  font-weight: 550;
  font-size: var(--ae-type-caption);
  overflow-wrap: anywhere;
}
.catalog-item small {
  display: block;
  font-size: var(--ae-type-caption);
  color: var(--muted);
  margin-top: 3px;
}
.check-box {
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  border: 1px solid var(--border);
  border-radius: 4px;
  flex-shrink: 0;
}
.selected .check-box {
  background: var(--accent);
  color: var(--theme-on-primary);
  border-color: var(--accent);
}
.candidate {
  margin-bottom: 22px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 20px;
}
.candidate h3 {
  margin-bottom: 9px;
}
.candidate details {
  margin: 12px 0;
}
.fatal-error {
  padding: 80px 30px;
  color: var(--ink);
  background: var(--canvas);
  height: 100%;
}
.fatal-error p {
  margin: 15px 0;
}
.mobile-only,
.mobile-panel-nav,
.drawer-backdrop {
  display: none;
}
@media (min-width: 821px) {
  .workbench.sidebar-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }
  .workbench.sidebar-collapsed.has-panel {
    grid-template-columns: minmax(0, 1fr) 4px minmax(340px, min(var(--panel-width), 48vw));
  }
}
@media (max-width: 1200px) {
  .workbench {
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  }
  .workbench.has-panel {
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr) 4px minmax(340px, 40vw);
  }
  .expanded-panel .work-area {
    left: var(--sidebar-width);
  }
  .starter-grid {
    grid-template-columns: 1fr;
    gap: 6px;
    margin-top: 18px;
  }
  .starter-grid .button {
    align-items: center;
    padding: 10px;
  }
  .starter-grid strong {
    display: inline;
    margin-right: 8px;
  }
  .starter-grid small {
    display: inline;
  }
  .workspace-header {
    padding: 0 16px;
  }
  .transcript {
    padding: 24px 20px;
  }
}
@media (max-width: 820px) {
  .workbench,
  .workbench.has-panel {
    grid-template-columns: minmax(0, 1fr);
  }
  .workbench.has-panel {
    grid-template-columns: minmax(0, 1fr) 4px minmax(340px, 46vw);
  }
  .desktop-sidebar-toggle {
    display: none;
  }
  .sidebar,
  .sidebar-collapsed > .sidebar {
    display: flex;
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(88vw, 310px);
    transform: translateX(-100%);
    z-index: 22;
    box-shadow: 10px 0 30px var(--ui-shadow);
  }
  .sidebar.open {
    transform: translateX(0);
  }
  .sidebar-close {
    align-self: flex-end;
    margin: 8px 12px 0;
  }
  .drawer-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: var(--ui-overlay);
    z-index: 21;
  }
  .mobile-only {
    display: inline-flex;
  }
  .expanded-panel .work-area {
    left: 0;
  }
  .welcome {
    padding-top: 48px;
  }
}
@media (max-width: 720px) {
  .workbench,
  .workbench.has-panel {
    display: flex;
  }
  .main-pane {
    width: 100%;
  }
  .workspace-header {
    height: 54px;
    min-height: 54px;
    padding: 0 12px;
    gap: 7px;
  }
  .workspace-breadcrumb > span,
  .workspace-breadcrumb > svg {
    display: none;
  }
  .workspace-breadcrumb strong {
    font-size: var(--ae-type-caption);
  }
  .work-area,
  .expanded-panel .work-area {
    position: fixed;
    z-index: 10;
    inset: 54px 0 52px;
    box-shadow: 0 -6px 24px var(--ui-shadow);
  }
  .panel-header {
    height: 46px;
  }
  .panel-resizer {
    display: none;
  }
  .mobile-panel-nav {
    display: flex;
    justify-content: space-around;
    border-top: 1px solid var(--line);
    padding: 4px 6px max(4px, env(safe-area-inset-bottom));
    background: var(--rail);
    flex-shrink: 0;
    min-height: 48px;
    z-index: 11;
  }
  .mobile-panel-nav .button {
    font-size: var(--ae-type-caption);
    min-height: 38px;
  }
  .welcome {
    padding: 40px 20px 25px;
    flex: 1;
    min-height: 0;
  }
  .welcome h1 {
    font-size: clamp(1.6rem, 3vw, 2.15rem);
  }
  .welcome-heading p {
    font-size: var(--ae-type-caption);
  }
  .welcome-heading {
    margin-bottom: 23px;
  }
  .welcome-symbol {
    margin-bottom: 15px;
  }
  .composer-area {
    padding: 9px 12px 8px;
  }
  .composer textarea {
    font-size: 16px;
    padding: 14px 64px 8px 14px;
  }
  .composer-footnote {
    font-size: var(--ae-type-caption);
    margin-top: 7px;
  }
  .desktop-only {
    display: none !important;
  }
  .starter-grid {
    margin-bottom: 28px;
  }
  .starter-grid .button {
    min-height: 47px;
  }
  .recent-work button small {
    display: none;
  }
  .transcript {
    padding: 20px 17px 14px;
  }
  .message {
    margin-bottom: 24px;
  }
  .markdown {
    font-size: 14px;
  }
  .task-center {
    padding: 25px 18px;
  }
  .task-row {
    flex-wrap: wrap;
    gap: 8px;
  }
  .task-row > .status {
    margin-left: 27px;
  }
  .task-info {
    flex-basis: calc(100% - 38px);
  }
  .task-actions {
    margin-left: auto;
  }
  .modal-layer {
    padding: 50px 10px 15px;
  }
  .dialog {
    max-height: 85dvh;
  }
  .thread-more {
    opacity: 1;
  }
  .icon-button {
    width: 34px;
    height: 34px;
    min-height: 34px;
  }
  .revision-input textarea {
    font-size: 16px;
  }
  .artifact-title {
    padding: 12px;
  }
  .source-editor {
    font-size: var(--ae-type-caption);
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    scroll-behavior: auto !important;
    transition: none !important;
  }
}
:host-context([data-aisecedu-motion='reduced']) * {
  animation: none !important;
  scroll-behavior: auto !important;
}

.conversation-file {
  display: flex;
  align-items: center;
  width: min(100%, 560px);
  min-width: 0;
  padding: 3px 8px 3px 3px;
  margin: 9px 0;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--raised);
}
.conversation-file:hover,
.conversation-file[data-active='true'] {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--line));
}
.conversation-file[data-active='true'] {
  background: color-mix(in srgb, var(--accent) 5%, var(--raised));
}
.conversation-file-open {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  padding: 9px;
  text-align: left;
  border-radius: 7px;
}
.conversation-file-open:hover {
  background: var(--hover);
}
.conversation-file-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 42px;
  border-radius: 8px;
  color: var(--accent);
  background: var(--accent-soft);
}
.conversation-file-name {
  min-width: 0;
}
.conversation-file-name strong,
.conversation-file-name small {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.conversation-file-name strong {
  font-size: .9rem;
  font-weight: 650;
}
.conversation-file-name small {
  color: var(--muted);
  font-size: var(--ae-type-caption);
}

.file-preview {
  position: relative;
  container-type: inline-size;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: color-mix(in srgb, var(--soft) 82%, var(--rail));
}
.file-preview-toolbar,
.file-preview-footer {
  display: flex;
  align-items: center;
  flex: none;
  gap: 8px;
  justify-content: space-between;
  background: var(--raised);
  color: var(--ink);
}
.file-preview-toolbar {
  min-height: 59px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
}
.file-preview-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 480px;
  flex: 1;
  padding-left: 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--rail);
  color: var(--accent);
}
.file-preview-picker select,
.file-preview-zoom {
  min-height: 36px;
  font-size: var(--ae-type-caption);
  color: var(--ink);
}
.file-preview-picker select {
  width: 100%;
  min-width: 0;
  text-overflow: ellipsis;
  border: 0;
  background: transparent;
  padding: 0 8px 0 0;
  font-weight: 650;
}
.file-preview-picker svg {
  flex: none;
}
.file-preview-tools,
.file-page-controls {
  display: flex;
  align-items: center;
  flex: none;
  gap: 3px;
}
.file-preview-tools .icon-button {
  width: 34px;
  height: 36px;
}
.file-preview-zoom {
  padding: 0 5px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--rail);
}
.file-preview-zoom:disabled {
  opacity: .55;
}
.file-preview-canvas {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.file-preview-canvas:focus-visible {
  outline-offset: -2px;
}
.file-preview-stack {
  display: grid;
  align-content: start;
  justify-items: center;
  width: max-content;
  min-width: 100%;
  padding: 24px;
  gap: 18px;
}
.file-paper,
.file-reading-sheet {
  margin: 0;
  color: #1a2537;
  background: #fff;
  border: 1px solid #d5dbe3;
  box-shadow: 0 3px 9px #18284612;
}
.file-paper {
  position: relative;
  overflow: hidden;
}
.file-paper img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.file-reading-sheet {
  min-height: 320px;
  padding: clamp(18px, 4%, 46px);
  overflow: auto;
  overflow-wrap: anywhere;
  line-height: 1.65;
}
.file-reading-sheet .markdown {
  font-size: inherit;
  color: inherit;
}
.file-reading-sheet pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 0;
  font: .9em/1.6 var(--mono);
}
.file-reading-sheet table {
  border-collapse: collapse;
  width: 100%;
}
.file-reading-sheet th,
.file-reading-sheet td {
  padding: 7px 10px;
  text-align: left;
  border: 1px solid #d5dbe3;
}
.file-reading-sheet th {
  background: #edf1f7;
}
.file-reading-sheet .markdown :where(a, blockquote, code, table) {
  color: #283957;
}
.file-preview-limit {
  color: #495b74;
  margin: 0 0 12px;
  padding: 7px 9px;
  background: #eef3fa;
  font-size: .82em;
}
.file-html-preview {
  display: block;
  height: min(75vh, 950px);
  border: 1px solid #d5dbe3;
  background: #fff;
}
.file-preview-state,
.preview-page-error {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 10px;
  min-height: min(280px, 100%);
  padding: 16px;
  text-align: center;
  color: var(--muted);
}
.preview-page-error {
  position: absolute;
  inset: 0;
  color: #4e617a;
}
.file-preview-footer {
  min-height: 42px;
  padding: 3px 10px 3px 15px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: var(--ae-type-caption);
}
.file-page-controls span {
  min-width: 45px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.file-page-controls .icon-button {
  min-height: 34px;
}
.workbench.has-file-preview .panel-resizer {
  position: relative;
}
.workbench.has-file-preview .panel-resizer::after {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 3px;
  height: 30px;
  border-radius: 2px;
  background: var(--muted);
  transform: translate(-50%, -50%);
  content: '';
}
@media (min-width: 821px) {
  .workbench.has-panel.has-file-preview {
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr) 4px minmax(340px, min(var(--panel-width), 53vw));
  }
  .workbench.sidebar-collapsed.has-panel.has-file-preview {
    grid-template-columns: minmax(0, 1fr) 4px minmax(340px, min(var(--panel-width), 53vw));
  }
}
@media (min-width: 721px) and (max-width: 820px) {
  .workbench.has-panel.has-file-preview {
    grid-template-columns: minmax(0, 1fr) 4px minmax(340px, min(var(--panel-width), 52vw));
  }
}
@media (max-width: 720px) {
  .file-preview-toolbar {
    min-height: 50px;
    padding: 5px 7px;
  }
  .file-preview-stack {
    padding: 14px;
    gap: 12px;
  }
}

@container (max-width: 459px) {
  .file-preview-stack {
    padding: 14px;
    gap: 12px;
  }
}
`;var An=W(Le(),1),Mh=class extends Z0.Component{state={error:!1};static getDerivedStateFromError(){return{error:!0}}render(){return this.state.error?(0,An.jsxs)("div",{className:"fatal-error",children:[(0,An.jsx)("h1",{children:"\u5DE5\u4F5C\u53F0\u6682\u65F6\u65E0\u6CD5\u663E\u793A"}),(0,An.jsx)("p",{children:"\u540E\u53F0\u4EFB\u52A1\u4ECD\u4F1A\u7EE7\u7EED\uFF0C\u5237\u65B0\u540E\u53EF\u4EE5\u91CD\u65B0\u8BFB\u53D6\u8BB0\u5F55\u3002"}),(0,An.jsx)("button",{onClick:()=>location.reload(),children:"\u91CD\u65B0\u6253\u5F00\u5DE5\u4F5C\u53F0"})]}):this.props.children}},Dh=document.getElementById("cocreation-workbench");if(Dh){let e=Dh.attachShadow({mode:"open"}),t=document.createElement("style");t.textContent=K0,e.append(t);let a=document.createElement("div");a.id="workbench-root",e.append(a);let n=new Jc(Dh.dataset.ownerId||"");(0,J0.createRoot)(a).render((0,An.jsx)(Mh,{children:(0,An.jsx)(Hp.Provider,{value:n,children:(0,An.jsx)(Y0,{})})}))}})();
