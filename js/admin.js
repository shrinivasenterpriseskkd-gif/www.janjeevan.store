import{getFirestore,collection,addDoc,getDocs}from"https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";import{ref,uploadBytes,getDownloadURL}from"https://www.gstatic.com/firebasejs/12.3.0/firebase-storage.js";import{db,storage}from"./firebase-config.js";
const form=document.querySelector("#form"),area=document.querySelector("#area"),village=document.querySelector("#village"),latitude=document.querySelector("#latitude"),longitude=document.querySelector("#longitude");
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
form.onsubmit=async e=>{e.preventDefault();const f=document.querySelector("#image").files[0];if(!f){msg.textContent="Choose a product image before saving.";return}const saveButton=document.querySelector("#save-button");saveButton.disabled=true;msg.textContent="Uploading product...";try{const r=ref(storage,`products/${Date.now()}-${f.name}`);await uploadBytes(r,f);const url=await getDownloadURL(r);const[areaName]=area.value.split("|");await addDoc(collection(db,"products"),{name:pname.value,uom:uom.value,quantity:+quantity.value||0,avlbStk:+stock.value||0,price:+price.value||0,area:areaName,village:village.value.trim(),latitude:+latitude.value,longitude:+longitude.value,imageUrl:url,createdAt:Date.now()});msg.textContent="Product saved.";e.target.reset();village.value="";updateVillageOptions();latitude.value="";longitude.value=""}catch(error){console.error(error);msg.textContent=error.code==="storage/unauthorized"?"Image upload blocked by Firebase Storage rules. Publish storage.rules, then try again.":"Product could not be saved. Check Firebase permissions and try again."}finally{saveButton.disabled=false}};
document.querySelector("#export").onclick=async()=>{const s=await getDocs(collection(db,"products"));let csv="Product Name,UOM,Quantity,AVLB Stk,Price,Area,Village,Latitude,Longitude,Image URL\n";s.forEach(d=>{let p=d.data();csv+=`"${p.name||""}","${p.uom||""}",${p.quantity||0},${p.avlbStk||0},${p.price||0},"${p.area||""}","${p.village||""}",${p.latitude||""},${p.longitude||""},"${p.imageUrl||""}"\n`});const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="tribes-products.csv";a.click()};