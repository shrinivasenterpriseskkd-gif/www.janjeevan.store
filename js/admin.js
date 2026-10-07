import{collection,getDocs}from"https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";import{db}from"./firebase-config.js";
import{getCurrentLocation,isActiveOrder,renderOrderMap}from"./order-tracking.js";
const adminApiBase = (window.TRIBES_API_BASE_URL || "").replace(/\/$/, "");
try {
    if (!adminApiBase) throw new Error("Admin sign-in server is not configured.");
    const sessionResponse = await fetch(`${adminApiBase}/api/admin/session`, { credentials: "include" });
    if (!sessionResponse.ok) throw new Error("Could not validate the Admin session.");
    const session = await sessionResponse.json();
    if (!session.authenticated) {
        window.location.replace("login.html");
        throw new Error("Admin sign-in required.");
    }
} catch (error) {
    console.error("Admin session validation failed.", error);
    window.location.replace("login.html");
    throw error;
}
document.querySelector("#admin-sign-out").addEventListener("click", async () => {
    const signOutButton = document.querySelector("#admin-sign-out");
    signOutButton.disabled = true;
    try {
        const response = await fetch(`${adminApiBase}/api/admin/logout`, {
            method: "POST",
            credentials: "include"
        });
        if (!response.ok) throw new Error("Could not end the Admin session.");
        window.location.replace("login.html");
    } catch (error) {
        console.error("Admin sign-out failed.", error);
        document.querySelector("#msg").textContent = "Could not sign out. Please try again.";
        signOutButton.disabled = false;
    }
});
const loginIdList = document.querySelector("#login-id-list");
const loginIdSearch = document.querySelector("#login-id-search");
const loginIdCount = document.querySelector("#login-id-count");
const loginIdStatus = document.querySelector("#login-id-status");
const escapeLoginIdValue = value => String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;"
}[char]));
let accountRecords = [];
const renderLoginIds = () => {
    const query = loginIdSearch.value.trim().toLowerCase();
    const visible = accountRecords.filter(record =>
        `${record.type} ${record.name} ${record.id} ${record.email} ${record.phone} ${record.area}`.toLowerCase().includes(query)
    );
    loginIdCount.textContent = `${accountRecords.length} account${accountRecords.length === 1 ? "" : "s"}`;
    loginIdList.innerHTML = visible.length
        ? visible.map(record => `<article class="login-id-row"><div class="login-id-account"><span class="login-id-type">${escapeLoginIdValue(record.type)}</span><strong class="login-id-name">${escapeLoginIdValue(record.name)}</strong></div><div class="login-id-credentials"><span><small>Account ID</small><code class="login-id-value">${escapeLoginIdValue(record.id)}</code></span></div><div class="login-id-contact"><span><small>Email</small>${record.email ? escapeLoginIdValue(record.email) : "Not provided"}</span><span><small>Phone</small>${record.phone ? escapeLoginIdValue(record.phone) : "Not provided"}</span><span><small>Area</small>${record.area ? escapeLoginIdValue(record.area) : "Not provided"}</span></div></article>`).join("")
        : '<div class="empty-state"><p>No account records found.</p></div>';
};
const loadLoginIds = async () => {
    loginIdStatus.textContent = "Loading account records...";
    loginIdStatus.classList.remove("error");
    try {
        const response = await fetch(`${adminApiBase}/api/admin/accounts`, { credentials: "include" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Account records are unavailable.");
        accountRecords = Array.isArray(result.accounts) ? result.accounts : [];
        renderLoginIds();
        loginIdStatus.textContent = "";
    } catch (error) {
        console.error("Could not load Firebase account records.", error);
        loginIdStatus.textContent = error.message || "Account records could not be loaded. Refresh and try again.";
        loginIdStatus.classList.add("error");
    }
};
document.querySelector("#refresh-login-ids").addEventListener("click", loadLoginIds);
loginIdSearch.addEventListener("input", renderLoginIds);
const updateAdminNavigation = () => {
    const targetId = window.location.hash.slice(1);
    const activeId = ["overview", "accounts", "catalog", "reports"].includes(targetId)
        ? targetId
        : "overview";
    document.querySelectorAll(".admin-view").forEach(view => {
        view.hidden = view.id !== activeId;
    });
    document.querySelectorAll(".admin-nav a").forEach(link =>
        link.classList.toggle("active", link.getAttribute("href") === `#${activeId}`)
    );
    const heading = document.querySelector(".admin-topbar .eyebrow");
    const labels = { accounts: "Login IDs", reports: "Live Tracking" };
    heading.textContent = `Workspace / ${labels[activeId] || activeId.charAt(0).toUpperCase() + activeId.slice(1)}`;
};
window.addEventListener("hashchange", updateAdminNavigation);
updateAdminNavigation();
loadLoginIds();
const trackingOrders = document.querySelector("#admin-tracking-orders");
const trackingStatus = document.querySelector("#tracking-status");
const merchantLocationButton = document.querySelector("#share-merchant-location");
let merchantWatchId = null;
let merchantSharing = false;
let trackedOrders = [];
const loadAdminOrders = async () => {
    const response = await fetch(`${adminApiBase}/api/admin/orders`, { credentials: "include" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Order records are unavailable.");
    trackedOrders = Array.isArray(result.orders) ? result.orders : [];
    return trackedOrders;
};
const renderTrackingOrders = async () => {
    let orders;
    try {
        orders = (await loadAdminOrders()).filter(isActiveOrder);
    } catch (error) {
        console.error("Could not load orders for Admin GPS tracking.", error);
        trackingStatus.textContent = error.message || "Orders could not be loaded.";
        trackingStatus.className = "form-message error";
        return;
    }
    if (!orders.length && merchantWatchId !== null) {
        merchantSharing = false;
        navigator.geolocation.clearWatch(merchantWatchId);
        merchantWatchId = null;
        merchantLocationButton.textContent = "Share this device's pickup location";
        trackingStatus.textContent = "Merchant location sharing stopped because there are no active orders.";
    }
    trackingOrders.innerHTML = orders.length
        ? orders.slice().reverse().map(order => `<article class="admin-tracking-card"><div class="admin-tracking-heading"><div><small>Order</small><strong>${escapeLoginIdValue(order.orderId)}</strong></div><span class="customer-order-status">${escapeLoginIdValue(order.status)}</span></div><p>${escapeLoginIdValue(order.customerName || "Customer")} · ${escapeLoginIdValue(order.assignedPartnerId || "No Delivery Partner assigned")} · ${escapeLoginIdValue(order.deliveryState || "Area not set")}</p><ul>${(Array.isArray(order.items) ? order.items : []).map(item => `<li>${escapeLoginIdValue(item.name)} × ${escapeLoginIdValue(item.quantity)}</li>`).join("")}</ul>${renderOrderMap(order)}</article>`).join("")
        : '<div class="empty-state"><p>No active orders.</p></div>';
};
const updateAdminOrderLocation = async (order, location, clear = false) => {
    const response = await fetch(`${adminApiBase}/api/admin/orders/${encodeURIComponent(order.id)}/location`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clear ? { clear: true } : location)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Pickup location could not be saved.");
};
const stopMerchantSharing = async clearLocations => {
    merchantSharing = false;
    if (merchantWatchId !== null) {
        navigator.geolocation.clearWatch(merchantWatchId);
        merchantWatchId = null;
    }
    merchantLocationButton.textContent = "Share this device's pickup location";
    if (clearLocations) {
        try {
            const activeOrders = trackedOrders.filter(isActiveOrder);
            await Promise.all(activeOrders.map(order => updateAdminOrderLocation(order, null, true)));
        } catch (error) {
            console.error("Could not clear the shared Merchant GPS location.", error);
            trackingStatus.textContent = "Sharing stopped, but the saved Merchant location could not be cleared.";
            trackingStatus.className = "form-message error";
        }
    }
};
merchantLocationButton.addEventListener("click", async () => {
    if (merchantWatchId !== null) {
        await stopMerchantSharing(true);
        trackingStatus.textContent = "Merchant pickup location sharing stopped and the saved GPS point was cleared.";
        trackingStatus.className = "form-message";
        return;
    }
    if (!navigator.geolocation) {
        trackingStatus.textContent = "This browser does not support location sharing.";
        trackingStatus.className = "form-message error";
        return;
    }
    try {
        await loadAdminOrders();
        if (!trackedOrders.some(isActiveOrder)) {
            trackingStatus.textContent = "There are no active orders to share this pickup location with.";
            return;
        }
    } catch (error) {
        console.error("Could not verify active orders before sharing the Merchant location.", error);
        trackingStatus.textContent = "Orders could not be loaded. Refresh and try again.";
        trackingStatus.className = "form-message error";
        return;
    }
    trackingStatus.textContent = "Waiting for location permission...";
    merchantSharing = true;
    merchantWatchId = navigator.geolocation.watchPosition(async position => {
        if (!merchantSharing) return;
        try {
            const location = { ...getCurrentLocation(position), label: "Merchant pickup (this device)" };
            await Promise.all(trackedOrders.filter(isActiveOrder).map(order => updateAdminOrderLocation(order, location)));
            trackingStatus.textContent = `This device's pickup location is live (accuracy about ${location.accuracy} m).`;
            trackingStatus.className = "form-message success";
            renderTrackingOrders();
        } catch (error) {
            console.error("Could not update the shared Merchant GPS location.", error);
            trackingStatus.textContent = "The latest pickup location could not be synced to active orders.";
            trackingStatus.className = "form-message error";
        }
    }, error => {
        merchantSharing = false;
        if (merchantWatchId !== null) navigator.geolocation.clearWatch(merchantWatchId);
        merchantWatchId = null;
        trackingStatus.textContent = error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Allow location access and try again."
            : "Could not get this device's location. Check device location settings and try again.";
        trackingStatus.className = "form-message error";
        console.error("Could not watch the Merchant GPS location.", error);
        merchantLocationButton.textContent = "Share this device's pickup location";
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    merchantLocationButton.textContent = "Stop sharing pickup location";
});
renderTrackingOrders();
window.setInterval(renderTrackingOrders, 15000);
window.addEventListener("pagehide", () => { void stopMerchantSharing(true); }, { once: true });
const form=document.querySelector("#form"),area=document.querySelector("#area"),village=document.querySelector("#village"),latitude=document.querySelector("#latitude"),longitude=document.querySelector("#longitude");
const productList=document.querySelector("#product-list"),productSearch=document.querySelector("#search"),resultCount=document.querySelector("#result-count"),imageInput=document.querySelector("#image"),imagePreview=document.querySelector("#image-preview");
const formatMoney=value=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(value)||0);
const effectivePrice=product=>Math.round((Number(product.price)||0)*(1-Math.min(100,Math.max(0,Number(product.discountPercent)||0))/100)*100)/100;
const escapeHtml=value=>String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[char]));
let catalogProducts=[];
const renderProducts=()=>{const query=productSearch.value.trim().toLowerCase();const filtered=catalogProducts.filter(({product})=>String(product.name||"").toLowerCase().includes(query));resultCount.textContent=`${filtered.length} product${filtered.length===1?"":"s"}`;productList.innerHTML=filtered.length?filtered.map(({id,product})=>{const discount=Number(product.discountPercent)||0;const salePrice=effectivePrice(product);return `<article class="product-row"><div class="product-thumb"><img src="${escapeHtml(product.imageUrl||"")}" alt="${escapeHtml(product.name||"Product")}"></div><div class="product-details"><strong>${escapeHtml(product.name||"Untitled product")}</strong><span>${escapeHtml(product.uom||"Unit")} · ${product.avlbStk??0} available</span></div><div class="product-prices"><strong>${formatMoney(salePrice)}</strong>${discount?`<span><s>${formatMoney(product.price)}</s> · ${discount}% off</span>`:""}</div><span class="stock-pill ${(Number(product.avlbStk)||0)>0?"available":"empty"}">${(Number(product.avlbStk)||0)>0?"In stock":"Out of stock"}</span></article>`}).join(""):'<div class="empty-state"><p>No products match your search.</p></div>'};
const loadProducts=async()=>{try{const snapshot=await getDocs(collection(db,"products"));catalogProducts=snapshot.docs.map(document=>({id:document.id,product:document.data()}));renderProducts()}catch(error){console.error("Could not load product catalog.",error);resultCount.textContent="Catalog unavailable";productList.innerHTML='<div class="empty-state"><p>Products could not be loaded. Check Firebase permissions and try again.</p></div>'}};
imageInput.addEventListener("change",()=>{const file=imageInput.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{imagePreview.innerHTML=`<img src="${reader.result}" alt="Selected product photo preview">`};reader.onerror=()=>{console.error("Could not preview the selected product image.");imagePreview.innerHTML="<strong>Image preview unavailable</strong>"};reader.readAsDataURL(file)});
productSearch.addEventListener("input",renderProducts);
loadProducts();
const villageOptions={
"Alluri Sitharama Raju":["Maredumilli","Rampachodavaram","Paderu","Chintapalli","S.Kota","Koyyuru","G.Madugula","Araku Valley","Munchingiput","Seethampeta","Ananthagiri","Pedabayalu","Gangalada","Rajavommangi","Sundarlapadu"],
"Anakapalli":["Anakapalle","Narsipatnam","Yelamanchili","Nakkapalli","Chodavaram"],
"Anantapur":["Anantapur","Guntakal","Dharmavaram","Tadipatri","Rayadurg"],
"Annamayya":["Madanapalle","Rajampet","Rayachoti","Pileru","Vayalpad"],
"Bapatla":["Bapatla","Chirala","Repalle","Ponnur","Addanki"],
"Chittoor":["Chittoor","Tirupati","Madanapalle","Palamaner","Puttur"],
"Dr. B. R. Ambedkar Konaseema":["Amalapuram","Razole","Mummidivaram","Kothapeta","Mumidivaram"],
"East Godavari":["Rajamahendravaram","Kovvur","Anaparthi","Jaggampeta","Peddapuram"],
"Eluru":["Eluru","Bhimadole","Jangareddygudem","Nuzvid","Polavaram"],
"Guntur":["Guntur","Tenali","Narasaraopet","Mangalagiri","Sattenapalle"],
"Kakinada":["Kakinada","Pithapuram","Tuni","Peddapuram","Prathipadu"],
"Krishna":["Machilipatnam","Gudivada","Vijayawada","Nandigama","Vuyyuru"],
"Kurnool":["Kurnool","Adoni","Nandyal","Dhone","Yemmiganur"],
"Nandyal":["Nandyal","Atmakur","Banaganapalle","Dhone","Allagadda"],
"NTR":["Vijayawada","Jaggayyapeta","Tiruvuru","Mylavaram","G Konduru"],
"Palnadu":["Narasaraopet","Chilakaluripet","Piduguralla","Sattenapalle","Vinukonda"],
"Parvathipuram Manyam":["Parvathipuram","Salur","Kurupam","Gummalakshmipuram","Jiyyammavalasa"],
"Prakasam":["Ongole","Markapur","Kandukur","Chimakurthy","Darsi"],
"Srikakulam":["Srikakulam","Palasa","Amadalavalasa","Narasannapeta","Tekkali"],
"Sri Sathya Sai":["Puttaparthi","Hindupur","Kadiri","Dharmavaram","Madakasira"],
"Tirupati":["Tirupati","Srikalahasti","Sullurpeta","Gudur","Naidupeta"],
"Visakhapatnam":["Visakhapatnam","Bheemunipatnam","Gajuwaka","Madhurawada","Anandapuram"],
"Vizianagaram":["Vizianagaram","Bobbili","Gajapathinagaram","Nellimarla","Kothavalasa"],
"West Godavari":["Bhimavaram","Tadepalligudem","Tanuku","Narsapur","Palakollu"],
"YSR Kadapa":["Kadapa","Proddatur","Pulivendula","Rajampet","Jammalamadugu"]};
const updateVillageOptions=()=>{const selectedArea=area.value.split("|")[0]||"";const options=villageOptions[selectedArea]||[];village.innerHTML=options.length?`<option value="">Select village</option>${options.map(item=>`<option value="${item}">${item}</option>`).join("")}`:`<option value="">Select village</option>`;village.disabled=!options.length;village.value="";};
area.addEventListener("change",()=>{const[areaName,lat,long]=area.value.split("|");latitude.value=lat||"";longitude.value=long||"";updateVillageOptions();});
updateVillageOptions();
const fileToDataUrl=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("Could not read the selected product image."));reader.readAsDataURL(file)});
form.onsubmit=async e=>{
    e.preventDefault();
    if(!form.checkValidity()){form.reportValidity();return}
    const file=imageInput.files[0],discountPercent=Number(document.querySelector("#discount").value);
    if(!file){msg.textContent="Choose a product image before saving.";return}
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>=5*1024*1024){msg.textContent="Choose a JPG, PNG, or WebP image smaller than 5 MB.";return}
    if(!Number.isInteger(discountPercent)||discountPercent<0||discountPercent>100){msg.textContent="Discount must be a whole percentage from 0 to 100.";return}
    const saveButton=document.querySelector("#save-button");saveButton.disabled=true;msg.textContent="Uploading product...";
    try{
        const[areaName]=area.value.split("|");
        const product={name:pname.value.trim(),uom:uom.value,quantity:+quantity.value||0,avlbStk:+stock.value||0,price:+price.value||0,discountPercent,area:areaName,village:village.value.trim(),latitude:+latitude.value||0,longitude:+longitude.value||0};
        const response=await fetch(`${adminApiBase}/api/admin/products`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({product,imageDataUrl:await fileToDataUrl(file)})});
        const result=await response.json();if(!response.ok)throw new Error(result.error||"Product could not be saved.");
        catalogProducts.unshift({id:result.id,product:result.product});msg.textContent="Product saved.";e.target.reset();imagePreview.innerHTML="<span>＋</span><strong>Choose product image</strong><small>PNG, JPG up to 5MB</small>";village.value="";updateVillageOptions();latitude.value="";longitude.value="";renderProducts();
    }catch(error){console.error(error);msg.textContent=error.message||"Product could not be saved."}
    finally{saveButton.disabled=false}
};
document.querySelector("#export").onclick=async()=>{try{const s=await getDocs(collection(db,"products"));const quote=value=>`"${String(value??"").replace(/"/g,'""')}"`;const rows=[["Product Name","UOM","Quantity","Available Stock","Price","Discount Percent","Sale Price","Area","Village","Latitude","Longitude","Image URL"],...s.docs.map(d=>{const p=d.data();return[p.name,p.uom,p.quantity,p.avlbStk,p.price,p.discountPercent||0,effectivePrice(p),p.area,p.village,p.latitude,p.longitude,p.imageUrl]})];const csv=rows.map(row=>row.map(quote).join(",")).join("\r\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download="tribes-products.csv";a.click();window.setTimeout(()=>URL.revokeObjectURL(a.href),1000)}catch(error){console.error("Could not export product catalog.",error);msg.textContent="Products could not be exported. Check Firebase permissions and try again."}};