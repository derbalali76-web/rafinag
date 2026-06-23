/* functions/index.js
   دالة سحابية تُرسل إشعاراً للزبون عند إنشاء فاتورة باسمه.
   تتطلب خطة Blaze. النشر: firebase deploy --only functions
*/
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

exports.notifyCustomerOnInvoice = onDocumentCreated(
  { document: 'invoices/{id}', region: 'europe-west1' },
  async (event) => {
    const snap = event.data;
    if (!snap) { console.log('⛔ لا يوجد مستند'); return; }
    const inv = snap.data() || {};
    const customerId = inv.customerId ? String(inv.customerId) : null;
    console.log('📄 فاتورة جديدة', { id: inv.id, customer: inv.customer, customerId });

    if (!customerId) { console.log('⛔ توقّف: الفاتورة بلا customerId — لن يُرسل إشعار'); return; }

    const db = getFirestore();
    const tokensSnap = await db.collection('customer_tokens')
      .where('customerId', '==', customerId).get();
    const tokens = tokensSnap.docs.map((d) => d.id);
    console.log(`🔑 عدد رموز الأجهزة للزبون ${customerId}: ${tokens.length}`);
    if (tokens.length === 0) { console.log('⛔ توقّف: لا يوجد رمز جهاز مسجّل لهذا الزبون'); return; }

    const title = 'فاتورة جديدة';
    const body = `تم تسجيل فاتورة #${inv.id || ''} في حسابك`;

    const message = {
      tokens,
      data: { title, body, invId: String(inv.id || '') },
      webpush: {
        headers: { Urgency: 'high', TTL: '86400' },
        fcmOptions: { link: '/' },
      },
    };

    const res = await getMessaging().sendEachForMulticast(message);
    console.log(`📤 نتيجة الإرسال: نجح ${res.successCount} / فشل ${res.failureCount}`);

    const dels = [];
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const code = (r.error && r.error.code) || '';
        console.log(`❌ فشل الرمز #${i}: ${code} — ${(r.error && r.error.message) || ''}`);
        if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
          dels.push(db.collection('customer_tokens').doc(tokens[i]).delete());
        }
      } else {
        console.log(`✅ أُرسل بنجاح للرمز #${i}`);
      }
    });
    await Promise.all(dels);
  }
);
