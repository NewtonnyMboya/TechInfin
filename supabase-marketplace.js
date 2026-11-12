(function(){
  var cfg=window.TECHINFIN_SUPABASE;
  if(!window.supabase||!cfg){console.error('Supabase client/config missing');return;}
  var sb=window.supabase.createClient(cfg.url,cfg.anonKey);
  window.TI_SUPABASE=sb; window.TI_USER=null; window.TI_PROFILE=null;
  function msg(s){var el=document.getElementById('tiAuthMessage');if(el)el.textContent=s;else if(typeof toast==='function')toast(s);}
  window.account=function(){
    if(window.TI_USER){return '<h1 class="page-title">Your account</h1><p class="sub">Secure TechInfin account</p><div class="panel"><b>'+String(window.TI_PROFILE&&window.TI_PROFILE.display_name||window.TI_USER.email||'Member').replace(/[&<>]/g,'')+'</b><p class="sub">'+String(window.TI_USER.email||'')+'</p><div class="notice">Signed in with Supabase authentication.</div><button class="btn" onclick="TI_SIGNOUT()">Sign out</button></div><div class="panel"><button class="link" onclick="toggleTheme()">Switch light / dark appearance</button></div>';}
    return '<h1 class="page-title">Sign in / Create account</h1><p class="sub">Access your TechInfin purchases and seller account.</p><div class="panel"><div class="form-grid"><div class="field full"><label>Email</label><input id="tiEmail" type="email" autocomplete="email" placeholder="you@example.com"></div><div class="field full"><label>Password</label><input id="tiPassword" type="password" minlength="8" autocomplete="current-password" placeholder="At least 8 characters"></div><div class="field full"><label>Display name (new accounts)</label><input id="tiName" placeholder="Your name"></div></div><br><button class="btn" onclick="TI_SIGNIN()">Sign in</button> <button class="btn secondary" onclick="TI_SIGNUP()">Create account</button><p id="tiAuthMessage" class="sub" style="margin-top:14px">Email verification may be required.</p></div>';
  };
  window.TI_SIGNIN=async function(){try{var e=document.getElementById('tiEmail').value.trim(),p=document.getElementById('tiPassword').value;var r=await sb.auth.signInWithPassword({email:e,password:p});if(r.error)throw r.error;msg('Signed in successfully.');}catch(e){msg(e.message||'Sign-in failed.');}};
  window.TI_SIGNUP=async function(){try{var e=document.getElementById('tiEmail').value.trim(),p=document.getElementById('tiPassword').value,n=document.getElementById('tiName').value.trim();if(p.length<8)throw new Error('Password must contain at least 8 characters.');var r=await sb.auth.signUp({email:e,password:p,options:{data:{display_name:n},emailRedirectTo:location.origin}});if(r.error)throw r.error;msg(r.data.session?'Account created.':'Account created. Check your email to confirm it.');}catch(e){msg(e.message||'Registration failed.');}};
  window.TI_SIGNOUT=async function(){var r=await sb.auth.signOut();if(r.error)toast(r.error.message);};
  async function sync(session){window.TI_USER=session&&session.user||null;window.TI_PROFILE=null;if(window.TI_USER){var p=await sb.from('profiles').select('*').eq('id',window.TI_USER.id).maybeSingle();window.TI_PROFILE=p.data||null;}if(typeof render==='function')render();}
  sb.auth.getSession().then(function(r){sync(r.data.session);});
  sb.auth.onAuthStateChange(function(_event,session){setTimeout(function(){sync(session);},0);});
  async function loadLiveProducts(){try{var r=await sb.from('products').select('id,name,category,description,price_kes').eq('status','published').order('created_at',{ascending:false});if(r.error)throw r.error;if(r.data&&r.data.length){products.splice(0,products.length,...r.data.map(function(p){return {id:p.id,name:p.name,cat:p.category,desc:p.description,price:p.price_kes,icon:'▣',tag:'VERIFIED',rating:'—'};}));if(typeof render==='function')render();}}catch(e){console.warn('Marketplace catalogue unavailable:',e.message);}}
  loadLiveProducts();

  var checkoutBusy=false;
  function checkoutMessage(t){var el=document.getElementById('tiCheckoutMessage');if(el)el.textContent=t;else if(typeof toast==='function')toast(t);}
  window.TI_CHECKOUT=async function(){
    if(checkoutBusy)return;
    if(!window.TI_USER){checkoutMessage('Please sign in before checkout.');if(typeof setPage==='function')setPage('account');return;}
    if(!cart||!cart.length){checkoutMessage('Your cart is empty.');return;}
    var phone=document.getElementById('tiCheckoutPhone');
    if(!phone||!phone.value.trim()){checkoutMessage('Enter the M-PESA phone number to receive the sandbox prompt.');return;}
    checkoutBusy=true;checkoutMessage('Creating your order securely…');
    try{
      var items=cart.map(function(x){return {product_id:String(x.id),quantity:Number(x.qty)};});
      var created=await sb.functions.invoke('create-order',{body:{items:items}});
      if(created.error)throw new Error(created.data&&created.data.error||created.error.message||'Could not create order');
      if(!created.data||!created.data.order_id)throw new Error('Order service returned an invalid response.');
      var orderId=created.data.order_id;
      localStorage.setItem('ti-pending-order',orderId);
      checkoutMessage('Order created. Requesting M-PESA sandbox prompt…');
      var pushed=await sb.functions.invoke('mpesa-stk-push',{body:{order_id:orderId,phone:phone.value.trim()}});
      if(pushed.error)throw new Error(pushed.data&&pushed.data.error||pushed.error.message||'STK Push request failed');
      checkoutMessage((pushed.data&&pushed.data.message)||'STK Push requested. Complete the prompt on the test handset, then check payment status.');
      if(typeof toast==='function')toast('Sandbox STK Push requested');
    }catch(e){checkoutMessage(e.message||'Checkout failed.');}
    finally{checkoutBusy=false;}
  };
  window.TI_CHECK_PAYMENT=async function(){
    var orderId=localStorage.getItem('ti-pending-order');
    if(!orderId){checkoutMessage('No pending order was found on this device.');return;}
    checkoutMessage('Checking verified payment status…');
    try{
      var r=await sb.functions.invoke('payment-status',{body:{order_id:orderId}});
      if(r.error)throw new Error(r.data&&r.data.error||r.error.message||'Could not check payment');
      var d=r.data||{},p=d.payment||{};
      if(d.order_status==='paid'&&p.status==='paid'){
        localStorage.removeItem('ti-pending-order');
        if(typeof toast==='function')toast('Payment verified. Purchase complete.');
        checkoutMessage('Payment verified successfully. M-PESA receipt: '+(p.receipt||'confirmed')+'.');
        if(typeof render==='function')render();
      }else{
        checkoutMessage('Order: '+(d.order_status||'unknown')+' · Payment: '+(p.status||'not received')+'. '+(p.message||'The callback may still be processing. Check again shortly.'));
      }
    }catch(e){checkoutMessage(e.message||'Status check failed.');}
  };
})();