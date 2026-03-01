require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// ดึงกุญแจจากที่ซ่อน (Environment Variables) 
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const LINE_TOKEN = process.env.LINE_TOKEN;
const LIFF_ID = "2009261202-Jruo3vhw"; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    const events = req.body.events;
    if (!events) return;

    for (const event of events) {
        if (event.type === 'message' && event.message.type === 'text') {
            const userText = event.message.text.trim();
            const replyToken = event.replyToken;

            if (userText.includes("สต๊อก") || userText.includes("สต๊อค")) {
                // ดึงข้อมูลจากคอลัมน์ใหม่ stock_weight
                const { data } = await supabase.from('products').select('*').limit(1);
                const weight = (data && data[0]) ? data[0].stock_weight : 0;
                await reply(replyToken, `🌑 [Z-Tech Global]\n📦 ยอดสต๊อกปัจจุบัน: ${weight} กรัม`);
            }
            else if (userText === 'รับเข้า' || userText === 'จ่ายออก') {
                const action = (userText === 'รับเข้า') ? 'in' : 'out';
                const url = "https://liff.line.me/" + LIFF_ID + "?action=" + action;
                await reply(replyToken, "🌑 ระบบ Z-Tech พร้อมสแกน\nกดที่ลิงก์เพื่อเปิดกล้อง (" + userText + "):\n" + url);
            }
        }
    }
});

async function reply(token, msg) {
    try {
        await axios.post('https://api.line.me/v2/bot/message/reply', {
            replyToken: token,
            messages: [{ type: 'text', text: msg }]
        }, {
            headers: { 'Authorization': 'Bearer ' + LINE_TOKEN }
        });
    } catch (e) { console.log("❌ Reply Error:", e.response ? e.response.data : e.message); }
}

// หน้าสแกน
app.get('/scan', (req, res) => {
    res.send(`<html><body style="background:#0a0a0a;color:#d4af37;text-align:center;padding:20px;">
    <h2>🌑 Z-TECH SCANNER</h2>
    <div id="reader"></div>
    <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
    <script src="https://unpkg.com/html5-qrcode"></script>
    <script>
    async function main(){
        await liff.init({liffId:"${LIFF_ID}"});
        if(!liff.isLoggedIn()){liff.login();return;}
        const scanner = new Html5Qrcode("reader");
        scanner.start({facingMode:"environment"},{fps:10,qrbox:250},async(c)=>{
            const act = new URLSearchParams(window.location.search).get("action");
            const r = await fetch("/api/scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({barcode:c,action:act})});
            const d = await r.json();
            alert(d.message);
            liff.closeWindow();
        });
    }
    main();
    </script>
    </body></html>`);
});

// เปลี่ยนพอร์ตให้คลาวด์สุ่มให้ได้ เพื่อไม่ให้ชนกับใครค่ะ
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 [System Ready]: อาณาจักร Z-Tech รันที่พอร์ต ${PORT}`));