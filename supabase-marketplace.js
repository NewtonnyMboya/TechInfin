(function(){
  var cfg=window.TECHINFIN_SUPABASE;
  if(!window.supabase||!cfg){console.error('Supabase client/config missing');return;}
  var sb=window.supabase.createClient(cfg.url,cfg.anonKey);
  window.TI_SUPABASE=sb; window.TI_USER=null; window.TI_PROFILE=null; window.TI_SELLER_PROFILE=null; window.TI_IS_ADMIN=false;
  function msg(s){var el=document.getElementById('tiAuthMessage');if(el)el.textContent=s;else if(typeof toast==='function')toast(s);}
  window.account=function(){
    if(window.TI_USER){return '<h1 class="page-title">Your account</h1><p class="sub">Secure TechInfin account</p><div class="panel"><b>'+String(window.TI_PROFILE&&window.TI_PROFILE.display_name||window.TI_USER.email||'Member').replace(/[&<>]/g,'')+'</b><p class="sub">'+String(window.TI_USER.email||'')+'</p><div class="notice">Signed in with Supabase authentication.</div><button class="btn" onclick="TI_SIGNOUT()">Sign out</button></div><div class="panel"><button class="link" onclick="toggleTheme()">Switch light / dark appearance</button>'+(window.TI_IS_ADMIN?'<hr><button class="btn" onclick="setPage(\'admin\')">Open administrator console</button>':'')+'</div>';}
    return '<h1 class="page-title">Sign in / Create account</h1><p class="sub">Access your TechInfin purchases and seller account.</p><div class="panel"><div class="form-grid"><div class="field full"><label>Email</label><input id="tiEmail" type="email" autocomplete="email" placeholder="you@example.com"></div><div class="field full"><label>Password</label><input id="tiPassword" type="password" minlength="8" autocomplete="current-password" placeholder="At least 8 characters"></div><div class="field full"><label>Display name (new accounts)</label><input id="tiName" placeholder="Your name"></div></div><br><button class="btn" onclick="TI_SIGNIN()">Sign in</button> <button class="btn secondary" onclick="TI_SIGNUP()">Create account</button><p id="tiAuthMessage" class="sub" style="margin-top:14px">Email verification may be required.</p></div>';
  };
  window.TI_SIGNIN=async function(){try{var e=document.getElementById('tiEmail').value.trim(),p=document.getElementById('tiPassword').value;var r=await sb.auth.signInWithPassword({email:e,password:p});if(r.error)throw r.error;msg('Signed in successfully.');}catch(e){msg(e.message||'Sign-in failed.');}};
  window.TI_SIGNUP=async function(){try{var e=document.getElementById('tiEmail').value.trim(),p=document.getElementById('tiPassword').value,n=document.getElementById('tiName').value.trim();if(p.length<8)throw new Error('Password must contain at least 8 characters.');var r=await sb.auth.signUp({email:e,password:p,options:{data:{display_name:n},emailRedirectTo:location.origin}});if(r.error)throw r.error;msg(r.data.session?'Account created.':'Account created. Check your email to confirm it.');}catch(e){msg(e.message||'Registration failed.');}};
  window.TI_SIGNOUT=async function(){var r=await sb.auth.signOut();if(r.error)toast(r.error.message);};
  window.TI_APPLY_SELLER=async function(){try{if(!window.TI_USER)throw new Error('Please sign in before applying.');var store=(document.getElementById('tiStoreName')||{}).value||'TechInfinstore';var legal=(document.getElementById('tiLegalName')||{}).value||'';store=store.trim();legal=legal.trim();if(store.length<2)throw new Error('Enter a valid store name.');var r=await sb.from('seller_profiles').insert({user_id:window.TI_USER.id,store_name:store,legal_name:legal||null,contact_email:window.TI_USER.email||null,status:'pending'}).select('*').single();if(r.error){if(r.error.code==='23505')throw new Error('A seller application already exists for this account. Refresh to view its status.');throw r.error;}window.TI_SELLER_PROFILE=r.data;msg('Seller application submitted. Your status is pending administrator review.');if(typeof render==='function')render();}catch(e){msg(e.message||'Seller application could not be submitted.');}};
  async function sync(session){window.TI_USER=session&&session.user||null;window.TI_PROFILE=null;window.TI_SELLER_PROFILE=null;window.TI_IS_ADMIN=false;if(window.TI_USER){var p=await sb.from('profiles').select('*').eq('id',window.TI_USER.id).maybeSingle();window.TI_PROFILE=p.data||null;window.TI_IS_ADMIN=!!(p.data&&p.data.role==='admin');var s=await sb.from('seller_profiles').select('*').eq('user_id',window.TI_USER.id).maybeSingle();window.TI_SELLER_PROFILE=s.data||null;}if(typeof render==='function')render();}
  sb.auth.getSession().then(function(r){sync(r.data.session);});
  sb.auth.onAuthStateChange(function(_event,session){setTimeout(function(){sync(session);},0);});
  async function loadLiveProducts(){try{var r=await sb.from('products').select('id,name,category,description,price_kes').eq('status','published').order('created_at',{ascending:false});if(r.error)throw r.error;var live=(r.data||[]).map(function(p){return {id:p.id,name:p.name,cat:p.category,desc:p.description,price:p.price_kes,icon:'▣',tag:'VERIFIED',rating:'—'};});products.splice(0,products.length,...live);var valid=new Set(live.map(function(p){return String(p.id);}));var kept=cart.filter(function(x){return valid.has(String(x.id));});if(kept.length!==cart.length){cart=kept;if(typeof save==='function')save();}if(typeof render==='function')render();}catch(e){console.warn('Marketplace catalogue unavailable:',e.message);}}
  loadLiveProducts();

  function safeText(v){return String(v||'').replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c];});}

  window.TI_UPLOAD_PRODUCT=async function(){
    var get=function(id){return document.getElementById(id);},status=get('tiUploadMessage');
    function say(t){if(status)status.textContent=t;else msg(t);}
    try{
      if(!window.TI_USER||!window.TI_SELLER_PROFILE||window.TI_SELLER_PROFILE.status!=='approved')throw new Error('An approved seller account is required.');
      var f=get('tiSoftwareFile').files[0],title=get('tiProductName').value.trim(),description=get('tiProductDescription').value.trim(),price=Number(get('tiProductPrice').value),type=f&&(f.type||'application/octet-stream');
      if(!f)throw new Error('Choose a software file.');
      if(f.size<1||f.size>524288000)throw new Error('File must be between 1 byte and 500 MB.');
      if(['application/zip','application/x-zip-compressed','application/octet-stream','application/pdf','application/vnd.android.package-archive'].indexOf(type)<0)throw new Error('Only ZIP, APK, PDF or binary software files are accepted.');
      if(title.length<3||title.length>120||description.length<10||!Number.isSafeInteger(price)||price<1||price>10000000)throw new Error('Enter a valid title, description (10+ characters), and KES price.');
      say('Requesting private upload permission…');
      var signed=await sb.functions.invoke('seller-upload-url',{body:{file_name:f.name,content_type:type}});
      if(signed.error)throw new Error(signed.data&&signed.data.error||signed.error.message);
      var uploaded=await sb.storage.from('software-private').uploadToSignedUrl(signed.data.path,signed.data.token,f,{contentType:type,upsert:false});
      if(uploaded.error)throw uploaded.error;
      say('File uploaded. Submitting product for administrator review…');
      var slug=title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)+'-'+crypto.randomUUID().slice(0,8);
      var row={seller_id:window.TI_USER.id,name:title,slug:slug,category:get('tiProductCategory').value,description:description,price_kes:price,version:get('tiProductVersion').value.trim()||null,compatibility:get('tiProductCompat').value.trim()||null,storage_path:signed.data.path,status:'pending_review'};
      var created=await sb.from('products').insert(row).select('id').single();
      if(created.error)throw created.error;
      say('Submitted successfully. Your software remains private until approved and published.');
      if(typeof render==='function')render();
    }catch(e){say(e.message||'Upload failed.');}
  };

  window.TI_ADMIN_REFRESH=async function(){
    var el=document.getElementById('tiAdminQueue');if(!el||!window.TI_IS_ADMIN)return;el.textContent='Loading moderation queue…';
    try{
      var sr=await sb.from('seller_profiles').select('user_id,store_name,contact_email').eq('status','pending').order('created_at');if(sr.error)throw sr.error;
      var pr=await sb.from('products').select('id,name,category,price_kes').eq('status','pending_review').order('created_at');if(pr.error)throw pr.error;
      var html='<h2>Seller applications ('+(sr.data||[]).length+')</h2>';
      (sr.data||[]).forEach(function(x){html+='<div class="cart-row"><div><b>'+safeText(x.store_name)+'</b><small>'+safeText(x.contact_email||'')+'</small></div><button class="btn" data-seller-id="'+x.user_id+'" data-review="approved">Approve</button><button class="remove" data-seller-id="'+x.user_id+'" data-review="rejected">Reject</button></div>';});
      html+='<h2 style="margin-top:24px">Software awaiting review ('+(pr.data||[]).length+')</h2>';
      (pr.data||[]).forEach(function(x){html+='<div class="cart-row"><div><b>'+safeText(x.name)+'</b><small>'+safeText(x.category)+' · KES '+Number(x.price_kes).toLocaleString()+'</small></div><button class="btn" data-product-id="'+x.id+'" data-review="published">Publish</button><button class="remove" data-product-id="'+x.id+'" data-review="rejected">Reject</button></div>';});
      el.innerHTML=html;
      el.querySelectorAll('[data-seller-id]').forEach(function(b){b.addEventListener('click',function(){window.TI_REVIEW_SELLER(b.dataset.sellerId,b.dataset.review);});});
      el.querySelectorAll('[data-product-id]').forEach(function(b){b.addEventListener('click',function(){window.TI_REVIEW_PRODUCT(b.dataset.productId,b.dataset.review);});});
    }catch(e){el.textContent='Moderation queue error: '+(e.message||'Unknown error');}
  };
  window.TI_REVIEW_SELLER=async function(id,status){if(!window.TI_IS_ADMIN||['approved','rejected'].indexOf(status)<0)return;var r=await sb.from('seller_profiles').update({status:status,updated_at:new Date().toISOString()}).eq('user_id',id);if(r.error){msg(r.error.message);return;}msg('Seller status updated.');window.TI_ADMIN_REFRESH();};
  window.TI_REVIEW_PRODUCT=async function(id,status){if(!window.TI_IS_ADMIN||['published','rejected'].indexOf(status)<0)return;var r=await sb.from('products').update({status:status,updated_at:new Date().toISOString()}).eq('id',id);if(r.error){msg(r.error.message);return;}msg(status==='published'?'Product published.':'Product rejected.');window.TI_ADMIN_REFRESH();loadLiveProducts();};
  window.TI_DOWNLOAD_PRODUCT=async function(id){try{if(!window.TI_USER)throw new Error('Sign in to download.');var r=await sb.functions.invoke('software-download',{body:{product_id:id}});if(r.error)throw new Error(r.data&&r.data.error||r.error.message);if(!r.data||!r.data.download_url)throw new Error('No download link returned.');window.open(r.data.download_url,'_blank','noopener');}catch(e){msg(e.message||'Download failed.');}};
  window.TI_LOAD_LIBRARY=async function(){
    var el=document.getElementById('tiLibraryItems');if(!el||!window.TI_USER)return;
    try{var r=await sb.from('order_items').select('product_id,product_name,orders!inner(status,buyer_id)').eq('orders.buyer_id',window.TI_USER.id).eq('orders.status','paid');if(r.error)throw r.error;
      var seen={},rows=(r.data||[]).filter(function(x){if(seen[x.product_id])return false;seen[x.product_id]=true;return true;});
      el.innerHTML=rows.length?rows.map(function(x){return '<div class="cart-row"><div><b>'+safeText(x.product_name)+'</b><small>Verified paid purchase</small></div><button class="btn" data-download-id="'+x.product_id+'">Secure download</button></div>';}).join(''):'<div class="empty"><b>Your library is empty</b>Paid purchases appear after payment verification.</div>';
      el.querySelectorAll('[data-download-id]').forEach(function(b){b.addEventListener('click',function(){window.TI_DOWNLOAD_PRODUCT(b.dataset.downloadId);});});
    }catch(e){el.textContent='Could not load library: '+e.message;}
  };
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
        cart=[];if(typeof save==='function')save();
        if(typeof toast==='function')toast('Payment verified. Purchase complete.');
        checkoutMessage('Payment verified successfully. M-PESA receipt: '+(p.receipt||'confirmed')+'.');
        if(typeof render==='function')render();
      }else{
        checkoutMessage('Order: '+(d.order_status||'unknown')+' · Payment: '+(p.status||'not received')+'. '+(p.message||'The callback may still be processing. Check again shortly.'));
      }
    }catch(e){checkoutMessage(e.message||'Status check failed.');}
  };
})();