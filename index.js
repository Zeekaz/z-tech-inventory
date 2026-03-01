require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
app.use(express.json());

// ทำให้เซิร์ฟเวอร์เปิดหน้าเว็บ dashboard.html ที่บอสมีอยู่ได้
app.use(express.static(path.join(__dirname))); 

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const LINE_TOKEN = process.env.LINE_TOKEN;
const LIFF_ID = "2009261202-Jruo3vhw"; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 1. หูฟังแชท LINE (Webhook) - กลับมาแล้วค่ะ!
app.post('/webhook', async (req, res) => {
    res.sendStatus(200);
    const events = req.body.events;
    if (!events) return;

    for (const event of events) {
        if (event.type === 'message' && event.message.type === 'text') {
            const userText = event.message.text.trim();
            const replyToken = event.replyToken;

            // เผื่อเซลล์พิมพ์ถามตรงๆ
            if (userText.includes("สต๊อก") || userText.includes("สต๊อค")) {
                await reply(replyToken, "🌑 เช็กสต๊อกทั้งหมดได้ที่ลิงก์นี้ค่ะ:\nhttps://z-tech-bot.onrender.com/dashboard.html");
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

// 2. สมองกลประมวลผลการสแกนเข้า-ออก
app.post('/api/scan', async (req, res) => {
    const { barcode, action, weight, user } = req.body; 

    if(!barcode.startsWith('ZT-')) {
        return res.json({ success: false, message: '❌ QR Code ไม่ใช่ของ Z-Tech ค่ะ!' });
    }

    const { data: item, error } = await supabase.from('ztech_inventory').select('*').eq('sku', barcode).single();
    
    if(error || !item) {
        return res.json({ success: false, message: '❌ ไม่พบรหัสสินค้านี้ในระบบคลังค่ะ!' });
    }

    let newWeight = parseFloat(item.stock_weight);
    let change = parseFloat(weight);

    if(action === 'in') {
        newWeight += change;
    } else {
        if(newWeight < change) return res.json({ success: false, message: '❌ สต๊อกไม่พอตัดค่ะ!' });
        newWeight -= change;
    }

    await supabase.from('ztech_inventory').update({ stock_weight: newWeight, last_updated: new Date() }).eq('sku', barcode);
    
    await supabase.from('ztech_logs').insert([{ 
        sku: barcode, 
        action_type: action.toUpperCase(), 
        weight_change: change,
        performed_by: user || 'Staff'
    }]);

    res.json({ success: true, message: `✅ สำเร็จ! สต๊อก ${item.strain_name} (${item.grade}) เหลือ ${newWeight} กรัม` });
});

// 3. หน้ากล้องสแกนเต็มจอ
app.get('/scan', (req, res) => {
    res.send(`
    <html>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0"/>
    <body style="background:#0a0a0a;color:#d4af37;text-align:center;padding:10px;font-family:sans-serif;margin:0;">
        <h2 style="margin-top:20px;letter-spacing:2px;">🌑 Z-TECH SCANNER</h2>
        <div id="reader" style="width:100%; max-width:500px; margin:auto; border: 2px solid #333; border-radius: 8px; overflow:hidden;"></div>
        
        <div id="input-section" style="display:none; margin-top:30px; padding:20px; background:#111; border-radius:10px; border:1px solid #d4af37;">
            <h3 id="scan-result" style="color:#fff; word-break: break-all;"></h3>
            <input type="number" id="weight-input" placeholder="ใส่น้ำหนัก (กรัม)" style="padding:15px; width:90%; font-size:18px; text-align:center; border-radius:5px; border:1px solid #d4af37; background:#222; color:#fff; margin-bottom:20px;">
            <br>
            <button onclick="submitData()" style="padding:15px; width:90%; background:#d4af37; color:#000; font-size:18px; font-weight:bold; border:none; border-radius:5px; cursor:pointer;">ยืนยันรายการ</button>
        </div>
        
        <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
        <script src="https://unpkg.com/html5-qrcode"></script>
        <script>
            let scannedBarcode = "";
            let currentAction = "";
            
            async function main(){
                await liff.init({liffId:"${LIFF_ID}"});
                if(!liff.isLoggedIn()){liff.login();return;}
                
                currentAction = new URLSearchParams(window.location.search).get("action");
                
                const scanner = new Html5Qrcode("reader");
                scanner.start({facingMode:"environment"}, {fps: 10}, (decodedText) => {
                    if(decodedText.startsWith("ZT-")) {
                        scanner.stop();
                        document.getElementById("reader").style.display = "none";
                        scannedBarcode = decodedText;
                        document.getElementById("scan-result").innerText = "เป้าหมาย: " + decodedText;
                        document.getElementById("input-section").style.display = "block";
                    } else {
                        alert("❌ คิวอาร์โค้ดไม่ถูกต้อง (ต้องขึ้นต้นด้วย ZT-)");
                    }
                });
            }
            
            async function submitData() {
                const weight = document.getElementById("weight-input").value;
                if(!weight || weight <= 0) return alert("กรุณาใส่น้ำหนักให้ถูกต้องค่ะ");
                
                const profile = await liff.getProfile();
                document.querySelector('button').innerText = "กำลังประมวลผล...";
                
                const res = await fetch("/api/scan", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({ barcode: scannedBarcode, action: currentAction, weight: weight, user: profile.displayName })
                });
                
                const data = await res.json();
                alert(data.message);
                if(data.success) liff.closeWindow();
                else location.reload();
            }
            
            main();
        </script>
    </body>
    </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 [System Ready]: อาณาจักร Z-Tech รันที่พอร์ต ${PORT}`));