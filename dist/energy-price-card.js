var m=["sun","mon","tue","wed","thu","fri","sat"],p={low:15,high:30};function f(o,e){let t=/^(\d{1,2}):(\d{2})$/.exec(String(o??"").trim());if(!t)throw new Error(`${e} must be in HH:MM format, got "${o}"`);let s=Number(t[1])*60+Number(t[2]);if(s>1440||Number(t[2])>59)throw new Error(`${e} is not a valid time: "${o}"`);return s}function g(o){if(o===void 0)return null;let e=Array.isArray(o)?o:String(o).split(",");return new Set(e.map(t=>{let s=m.indexOf(String(t).trim().toLowerCase().slice(0,3));if(s===-1)throw new Error(`Unknown day "${t}" (use mon, tue, wed...)`);return s}))}function _(o){return o.getHours()*60+o.getMinutes()}function y(o){return(o+6)%7}var h=class extends HTMLElement{setConfig(e){let t=Array.isArray(e.rates)?e.rates:[];if(t.length===0&&e.default_price===void 0)throw new Error("Add at least one rate or a default price");let s=t.map((r,a)=>{if(typeof r.price!="number")throw new Error(`rates[${a}].price must be a number (pence per kWh)`);return{start:f(r.start,`rates[${a}].start`),end:f(r.end,`rates[${a}].end`),price:r.price,label:r.label??"",color:r.color,days:g(r.days)}});this._config={title:e.title??"Electricity Price",default_price:e.default_price??null,default_label:e.default_label??"Standard",display:e.display==="pounds"?"pounds":"pence",decimals:e.decimals,thresholds:{...p,...e.thresholds??{}},show_next:e.show_next!==!1,show_schedule:e.show_schedule===!0,show_peak:e.show_peak!==!1,peak_hours:e.peak_hours??48,rates:s},this.shadowRoot||this.attachShadow({mode:"open"}),this._render()}set hass(e){this._hass=e}connectedCallback(){this._render(),this._scheduleTick()}disconnectedCallback(){clearTimeout(this._timer)}getCardSize(){return this._config?.show_schedule?4:2}static getConfigElement(){return document.createElement("energy-price-card-editor")}static getStubConfig(){return{title:"Electricity",default_price:24.5,rates:[{start:"17:00",end:"19:00",price:41,label:"Peak"},{start:"00:30",end:"05:30",price:7.5,label:"Off-peak"}]}}_scheduleTick(){clearTimeout(this._timer);let e=new Date,t=6e4-(e.getSeconds()*1e3+e.getMilliseconds());this._timer=setTimeout(()=>{this._render(),this._scheduleTick()},t+50)}_rateMatches(e,t){let s=_(t),r=t.getDay(),a=i=>e.days===null||e.days.has(i);return e.start===e.end?a(r):e.start<e.end?a(r)&&s>=e.start&&s<e.end:s>=e.start?a(r):s<e.end?a(y(r)):!1}_rateAt(e){let t=this._config.rates.find(s=>this._rateMatches(s,e));return t||(this._config.default_price===null?null:{price:this._config.default_price,label:this._config.default_label})}_boundaries(e,t){let s=[];for(let r=0;r<=t;r++)for(let a of this._config.rates)for(let i of[a.start,a.end]){let n=new Date(e);n.setHours(0,0,0,0),n.setDate(n.getDate()+r),n.setMinutes(i),n>e&&s.push(n)}return s.sort((r,a)=>r-a)}_nextChange(e,t){let s=t?.price??null;for(let r of this._boundaries(e,7)){let a=this._rateAt(r);if((a?.price??null)!==s)return{when:r,rate:a}}return null}_peakAhead(e,t,s){let r=new Date(e.getTime()+s*3600*1e3),a=t?{when:e,rate:t}:null;for(let i of this._boundaries(e,Math.ceil(s/24)+1)){if(i>=r)break;let n=this._rateAt(i);n&&(!a||n.price>a.rate.price)&&(a={when:i,rate:n})}return a}_formatPrice(e){if(e==null)return"\u2014";let{display:t,decimals:s}=this._config;if(t==="pounds")return`\xA3${(e/100).toFixed(s??2)}`;let r=s??(Number.isInteger(e)?0:2);return`${e.toFixed(r)}p`}_formatTime(e,t){let s=e.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});if(e.toDateString()===t.toDateString())return s;let a=new Date(t);return a.setDate(t.getDate()+1),e.toDateString()===a.toDateString()?`${s} tomorrow`:`${e.toLocaleDateString([],{weekday:"short"})} ${s}`}_colorFor(e){if(!e)return"var(--disabled-text-color, grey)";if(e.color)return e.color;let{low:t,high:s}=this._config.thresholds;return e.price<t?"var(--success-color, #43a047)":e.price>=s?"var(--error-color, #db4437)":"var(--warning-color, #ffa600)"}_minsToText(e){let t=String(Math.floor(e/60)).padStart(2,"0"),s=String(e%60).padStart(2,"0");return`${t}:${s}`}_render(){if(!this._config||!this.shadowRoot)return;let e=new Date,t=this._rateAt(e),s=this._config.show_next?this._nextChange(e,t):null,r=this._colorFor(t),a=s?`<div class="next">
           Until ${this._formatTime(s.when,e)}, then
           <span style="color:${this._colorFor(s.rate)}">${this._formatPrice(s.rate?.price)}</span>
           ${s.rate?.label?`(${s.rate.label})`:""}
         </div>`:"",i=this._config.show_peak?this._peakAhead(e,t,this._config.peak_hours):null,n=i?`<div class="peak">
           <span>Highest in next ${this._config.peak_hours}h</span>
           <span>
             <strong style="color:${this._colorFor(i.rate)}">${this._formatPrice(i.rate.price)}</strong>
             ${i.when===e?"now":`at ${this._formatTime(i.when,e)}`}
             ${i.rate.label?`(${i.rate.label})`:""}
           </span>
         </div>`:"",d=this._config.show_schedule?`<table class="schedule">
           ${this._config.rates.map(l=>`<tr class="${l===t?"active":""}">
                 <td>${this._minsToText(l.start)}\u2013${this._minsToText(l.end)}</td>
                 <td>${l.label}</td>
                 <td class="price" style="color:${this._colorFor(l)}">${this._formatPrice(l.price)}</td>
               </tr>`).join("")}
           ${this._config.default_price!==null?`<tr class="${t&&!this._config.rates.includes(t)?"active":""}">
                    <td>Other times</td><td>${this._config.default_label}</td>
                    <td class="price" style="color:${this._colorFor({price:this._config.default_price})}">
                      ${this._formatPrice(this._config.default_price)}
                    </td>
                  </tr>`:""}
         </table>`:"";this.shadowRoot.innerHTML=`
      <style>
        ha-card { padding: 16px; }
        .header { display: flex; justify-content: space-between; align-items: baseline; }
        .title { font-size: 1.1em; color: var(--secondary-text-color); }
        .label { font-size: 0.9em; padding: 2px 8px; border-radius: 10px;
                 background: color-mix(in srgb, ${r} 20%, transparent); color: ${r}; }
        .price-big { font-size: 3em; font-weight: 600; line-height: 1.2; color: ${r}; }
        .unit { font-size: 0.4em; font-weight: 400; color: var(--secondary-text-color); }
        .next { color: var(--secondary-text-color); margin-top: 4px; }
        .peak { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px;
                margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--divider-color);
                color: var(--secondary-text-color); }
        .schedule { width: 100%; margin-top: 12px; border-collapse: collapse; font-size: 0.9em; }
        .schedule td { padding: 4px 2px; border-top: 1px solid var(--divider-color); }
        .schedule .price { text-align: right; font-weight: 600; }
        .schedule tr.active td { background: var(--secondary-background-color); }
      </style>
      <ha-card>
        <div class="header">
          <div class="title">${this._config.title}</div>
          ${t?.label?`<div class="label">${t.label}</div>`:""}
        </div>
        <div class="price-big">
          ${this._formatPrice(t?.price)}<span class="unit"> /kWh</span>
        </div>
        ${a}
        ${n}
        ${d}
      </ha-card>
    `}};function c(o){return String(o??"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}var u=class extends HTMLElement{setConfig(e){if(this._lastSent&&JSON.stringify(e)===this._lastSent)return;let t=JSON.parse(JSON.stringify(e));t.rates=(t.rates??[]).map(s=>({...s,days:s.days===void 0?void 0:this._normaliseDays(s.days)})),this._config=t,this._render()}set hass(e){this._hass=e}_normaliseDays(e){return(Array.isArray(e)?e:String(e).split(",")).map(s=>String(s).trim().toLowerCase().slice(0,3))}_emit(){let e={...this._config};e.rates=e.rates.map(t=>{let s={...t};return(!s.days||s.days.length===0||s.days.length===7)&&delete s.days,s.label||delete s.label,s.color||delete s.color,s}),this._lastSent=JSON.stringify(e),this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:e},bubbles:!0,composed:!0}))}_setOption(e,t,s){t===""||t===null||t===void 0||t===s?delete this._config[e]:this._config[e]=t}_onInput(e){let t=e.target,s=t.dataset.key;if(!s)return;let r=t.value===""?void 0:Number(t.value);if(!(t.type==="number"&&t.value!==""&&Number.isNaN(r))){if(s.startsWith("rate.")){let[,a,i,n]=s.split("."),d=this._config.rates[Number(a)];if(i==="days"){let l=new Set(d.days??[]);t.checked?l.add(n):l.delete(n),d.days=m.slice(1).concat("sun").filter(b=>l.has(b))}else i==="price"?d.price=r??0:d[i]=t.value}else if(s.startsWith("thresholds.")){let a=s.split(".")[1],i={...this._config.thresholds??{}};r===void 0||r===p[a]?delete i[a]:i[a]=r,this._setOption("thresholds",Object.keys(i).length?i:void 0)}else s==="show_next"?this._setOption(s,t.checked,!0):s==="show_peak"?this._setOption(s,t.checked,!0):s==="peak_hours"?this._setOption(s,r,48):s==="show_schedule"?this._setOption(s,t.checked,!1):s==="display"?this._setOption(s,t.value,"pence"):t.type==="number"?this._setOption(s,r):this._setOption(s,t.value);this._emit()}}_onClick(e){let t=e.target.closest("button[data-action]");if(!t)return;let s=Number(t.dataset.index),r=this._config.rates;switch(t.dataset.action){case"add":r.push({start:"17:00",end:"19:00",price:0,label:""});break;case"remove":r.splice(s,1);break;case"up":s>0&&([r[s-1],r[s]]=[r[s],r[s-1]]);break;case"down":s<r.length-1&&([r[s+1],r[s]]=[r[s],r[s+1]]);break}this._render(),this._emit()}_renderRate(e,t,s){let r=new Set(e.days??[]),a=["mon","tue","wed","thu","fri","sat","sun"].map(i=>`<label class="day">
          <input type="checkbox" data-key="rate.${t}.days.${i}" ${r.has(i)?"checked":""}>
          ${i[0].toUpperCase()+i.slice(1)}
        </label>`).join("");return`
      <div class="rate">
        <div class="rate-head">
          <strong>Band ${t+1}</strong>
          <span>
            <button data-action="up" data-index="${t}" title="Move up" ${t===0?"disabled":""}>\u25B2</button>
            <button data-action="down" data-index="${t}" title="Move down" ${t===s-1?"disabled":""}>\u25BC</button>
            <button data-action="remove" data-index="${t}" title="Remove" class="danger">\u2715</button>
          </span>
        </div>
        <div class="grid">
          <label>Start<input type="time" data-key="rate.${t}.start" value="${c(e.start)}"></label>
          <label>End<input type="time" data-key="rate.${t}.end" value="${c(e.end)}"></label>
          <label>Price (p/kWh)<input type="number" step="0.01" data-key="rate.${t}.price" value="${c(e.price)}"></label>
          <label>Label<input type="text" data-key="rate.${t}.label" value="${c(e.label)}" placeholder="e.g. Peak"></label>
          <label class="wide">Colour<input type="text" data-key="rate.${t}.color" value="${c(e.color)}" placeholder="auto (or e.g. purple, #ff0000)"></label>
        </div>
        <div class="days">${a}</div>
        <div class="hint">No days ticked = every day. Bands that run past midnight are fine (e.g. 23:30 \u2192 05:30).</div>
      </div>`}_render(){if(!this._config)return;this.shadowRoot||(this.attachShadow({mode:"open"}),this.shadowRoot.addEventListener("input",r=>this._onInput(r)),this.shadowRoot.addEventListener("change",r=>this._onInput(r)),this.shadowRoot.addEventListener("click",r=>this._onClick(r)));let e=this._config,t={...p,...e.thresholds??{}},s=e.rates.map((r,a)=>this._renderRate(r,a,e.rates.length)).join("");this.shadowRoot.innerHTML=`
      <style>
        :host { display: block; }
        .section { margin-bottom: 16px; }
        h3 { font-size: 1em; margin: 16px 0 8px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
        .wide { grid-column: 1 / -1; }
        label { display: flex; flex-direction: column; font-size: 0.85em;
                color: var(--secondary-text-color); gap: 4px; }
        label.check { flex-direction: row; align-items: center; color: var(--primary-text-color); }
        input[type=text], input[type=number], input[type=time], select {
          font: inherit; font-size: 1rem; padding: 8px; border-radius: 4px;
          border: 1px solid var(--divider-color, #ccc);
          background: var(--card-background-color, #fff); color: var(--primary-text-color);
        }
        .rate { border: 1px solid var(--divider-color, #ccc); border-radius: 8px;
                padding: 12px; margin-bottom: 12px; }
        .rate-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .days { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 10px; }
        .day { flex-direction: row; align-items: center; gap: 2px; color: var(--primary-text-color); }
        .hint { font-size: 0.8em; color: var(--secondary-text-color); margin-top: 6px; }
        button { font: inherit; cursor: pointer; border-radius: 4px; padding: 4px 8px;
                 border: 1px solid var(--divider-color, #ccc);
                 background: var(--secondary-background-color); color: var(--primary-text-color); }
        button:disabled { opacity: 0.4; cursor: default; }
        button.danger { color: var(--error-color, #db4437); }
        button.add { width: 100%; padding: 8px; background: var(--primary-color); color: var(--text-primary-color, #fff); border: none; }
      </style>

      <div class="section grid">
        <label class="wide">Title<input type="text" data-key="title" value="${c(e.title)}" placeholder="Electricity Price"></label>
        <label>Default price (p/kWh)<input type="number" step="0.01" data-key="default_price" value="${c(e.default_price)}" placeholder="used outside bands"></label>
        <label>Default label<input type="text" data-key="default_label" value="${c(e.default_label)}" placeholder="Standard"></label>
        <label>Show price as
          <select data-key="display">
            <option value="pence" ${e.display!=="pounds"?"selected":""}>Pence (41p)</option>
            <option value="pounds" ${e.display==="pounds"?"selected":""}>Pounds (\xA30.41)</option>
          </select>
        </label>
        <label>Decimal places<input type="number" min="0" max="4" data-key="decimals" value="${c(e.decimals)}" placeholder="auto"></label>
        <label>Green below (p)<input type="number" step="0.01" data-key="thresholds.low" value="${t.low}"></label>
        <label>Red from (p)<input type="number" step="0.01" data-key="thresholds.high" value="${t.high}"></label>
        <label class="check"><input type="checkbox" data-key="show_next" ${e.show_next!==!1?"checked":""}>Show next price change</label>
        <label class="check"><input type="checkbox" data-key="show_peak" ${e.show_peak!==!1?"checked":""}>Show highest upcoming price</label>
        <label>Look ahead (hours)<input type="number" min="1" max="168" data-key="peak_hours" value="${c(e.peak_hours??48)}"></label>
        <label class="check"><input type="checkbox" data-key="show_schedule" ${e.show_schedule?"checked":""}>Show full schedule</label>
      </div>

      <h3>Price bands</h3>
      <div class="hint" style="margin-bottom:8px">Checked top to bottom \u2014 the first matching band wins.</div>
      ${s}
      <button class="add" data-action="add">+ Add price band</button>
    `}};customElements.define("energy-price-card",h);customElements.define("energy-price-card-editor",u);window.customCards=window.customCards||[];window.customCards.push({type:"energy-price-card",name:"Energy Price Card",preview:!0,description:"Shows the current electricity price from a time-of-use schedule."});
