const SUPABASE_URL = 'https://ilowgcbrwtkopfdefqeo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7d-DvewxszAn5UEj0oJQpQ_ooinpsn_';
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMIN_EMAIL = 'reyhlejackson3@gmail.com';
const OWNER_FORMSPREE = 'https://formspree.io/f/mojblyqg';

async function getUser() {
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.user : null;
}

async function getProfile(userId) {
  const { data } = await sb.from('profiles').select('*').eq('id', userId).single();
  return data;
}

function isOwner(user) {
  return user && user.email === ADMIN_EMAIL;
}

async function handleLogout() {
  await sb.auth.signOut();
  window.location.href = 'index.html';
}

async function updateCartCount() {
  const user = await getUser();
  if (!user) return;
  const { data } = await sb.from('cart_items').select('id').eq('user_id', user.id);
  document.querySelectorAll('.cart-count').forEach(el => { if (el && data) el.textContent = data.length; });
}

async function addToCart(productId) {
  const user = await getUser();
  if (!user) { window.location.href = 'auth.html'; return; }
  const { error } = await sb.from('cart_items').insert({ user_id: user.id, product_id: productId });
  if (!error) { updateCartCount(); showToast('Added to cart!'); }
  else if (error.code === '23505') showToast('Already in cart');
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:2rem;right:2rem;background:${type==='error'?'#ef4444':'#0f172a'};color:#fff;padding:.75rem 1.5rem;font-family:'Manrope',sans-serif;font-size:.88rem;font-weight:500;z-index:9999;border-left:3px solid #38bdf8;box-shadow:0 4px 16px rgba(0,0,0,.2);`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

async function uploadProductPhoto(file) {
  const ext = file.name.split('.').pop();
  const path = `products/${Date.now()}.${ext}`;
  const { data, error } = await sb.storage.from('product-images').upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: urlData } = sb.storage.from('product-images').getPublicUrl(path);
  return urlData.publicUrl;
}

function buildNav(user, profile) {
  const owner = isOwner(user);
  const isSeller = profile && (profile.account_type === 'seller' || profile.account_type === 'both');
  return `
  <nav>
    <div class="nav-left">
      <a href="index.html" class="logo">
        <img src="logo.png" alt="Shiftable" class="nav-logo-img">
      </a>
      <div class="nav-search">
        <input type="text" placeholder="Search AI systems..." id="navSearchInput" onkeydown="if(event.key==='Enter')window.location.href='marketplace.html?q='+this.value">
        <button onclick="window.location.href='marketplace.html?q='+document.getElementById('navSearchInput').value">Search</button>
      </div>
    </div>
    <div class="nav-links">
      <a href="marketplace.html">Marketplace</a>
      <a href="shiftable-systems.html">Shiftable Systems</a>
      <a href="consulting.html">Consulting</a>
      ${owner ? '<a href="owner-dashboard.html" style="color:#38bdf8;font-weight:700;">Owner</a>' : ''}
    </div>
    <div class="nav-right">
      <a href="cart.html" class="nav-cart">Cart (<span class="cart-count">0</span>)</a>
      ${user ? `
        <div class="nav-user-menu">
          <span class="nav-username">${user.email.split('@')[0]}</span>
          <div class="nav-dropdown">
            <a href="${owner ? 'owner-dashboard.html' : (isSeller ? 'seller-dashboard.html' : 'buyer-dashboard.html')}">Dashboard</a>
            ${isSeller && !owner ? '<a href="add-product.html">Add Product</a>' : ''}
            ${owner ? '<a href="add-product.html">Add Product</a>' : ''}
            <a href="#" onclick="handleLogout()">Log Out</a>
          </div>
        </div>
      ` : `
        <a href="auth.html" class="btn-nav-ghost">Log In</a>
        <a href="auth.html?tab=signup" class="btn-nav-primary">Sign Up</a>
      `}
    </div>
  </nav>`;
}

const NAV_CSS = `
nav{display:flex;align-items:center;justify-content:space-between;padding:.75rem 2rem;background:#0f172a;position:sticky;top:0;z-index:100;gap:1rem;}
.nav-left{display:flex;align-items:center;gap:1.25rem;flex:1;}
.logo{display:flex;align-items:center;text-decoration:none;flex-shrink:0;}
.nav-logo-img{height:52px;width:auto;display:block;}
.nav-search{display:flex;flex:1;max-width:520px;}
.nav-search input{flex:1;border:none;padding:.55rem 1rem;font-size:.88rem;outline:none;font-family:'Manrope',sans-serif;}
.nav-search button{background:#38bdf8;color:#fff;border:none;padding:.55rem 1.1rem;cursor:pointer;font-weight:600;font-size:.85rem;font-family:'Manrope',sans-serif;transition:background .2s;}
.nav-search button:hover{background:#0ea5e9;}
.nav-links{display:flex;gap:1.5rem;}
.nav-links a{font-size:.82rem;color:#94a3b8;text-decoration:none;font-weight:500;white-space:nowrap;transition:color .2s;}
.nav-links a:hover{color:#fff;}
.nav-right{display:flex;align-items:center;gap:.75rem;flex-shrink:0;}
.nav-cart{font-size:.82rem;color:#fff;text-decoration:none;padding:.4rem .85rem;border:1.5px solid #334155;white-space:nowrap;transition:all .2s;}
.nav-cart:hover{border-color:#38bdf8;}
.nav-username{font-size:.82rem;font-weight:600;color:#fff;padding:.4rem .75rem;border:1.5px solid #334155;cursor:pointer;display:block;}
.nav-user-menu{position:relative;}
.nav-user-menu:hover .nav-dropdown{display:flex;}
.nav-dropdown{position:absolute;top:100%;right:0;background:#fff;border:1px solid #e2e8f0;min-width:160px;display:none;flex-direction:column;box-shadow:0 8px 24px rgba(0,0,0,.15);z-index:200;}
.nav-dropdown a{padding:.65rem 1rem;font-size:.85rem;color:#475569;text-decoration:none;transition:background .2s;}
.nav-dropdown a:hover{background:#f0f9ff;color:#38bdf8;}
.btn-nav-ghost{font-size:.82rem;color:#94a3b8;text-decoration:none;padding:.4rem .85rem;border:1.5px solid #334155;transition:all .2s;}
.btn-nav-ghost:hover{color:#fff;}
.btn-nav-primary{font-size:.82rem;background:#38bdf8;color:#fff;text-decoration:none;padding:.4rem .9rem;font-weight:600;transition:background .2s;}
.btn-nav-primary:hover{background:#0ea5e9;}
.sv-badge{display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg,#0284c7,#38bdf8);color:#fff;font-size:.62rem;font-weight:700;padding:3px 8px;letter-spacing:.04em;font-family:'League Spartan',sans-serif;}
.sv-badge svg{width:10px;height:10px;}
`;
