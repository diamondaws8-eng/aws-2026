# النشر والتشغيل — قائمة تحقق

## متغيرات البيئة على Vercel

| المتغير | القيمة |
|---|---|
| `DATABASE_URL` | رابط مجمّع اتصالات Supabase (المنفذ 6543، وضع المعاملات) |
| `BETTER_AUTH_SECRET` | سر عشوائي طويل (32 حرفاً فأكثر) |
| `BETTER_AUTH_URL` | عنوان الموقع النهائي بالضبط، مثل `https://school.example.sa` — يُستحسن. لم يعد غيابه يرفض الدخول: العنوان الذي وصل إليه الطلب نفسه موثوق كأصل (`sameHostOrigins` في `lib/auth.ts`) |
| `AUTH_TRUSTED_ORIGINS` | (اختياري) عناوين أخرى يُفتح منها الموقع نفسه، مفصولة بفاصلة |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | المفتاح العام للإشعارات الفورية (اختياري — انظر «الإشعارات الفورية» أدناه) |
| `VAPID_PRIVATE_KEY` | المفتاح الخاص للإشعارات الفورية — **سرّي**، لا يُكتب في أي ملف يُرفع |
| `VAPID_SUBJECT` | `mailto:` بريد المدرسة — تطلبه خدمات الإشعارات للتواصل عند المشاكل |

## المنطقة

`vercel.json` يثبّت تنفيذ الدوال في `dub1` (دبلن) حيث قاعدة البيانات؛ كل استعلام يكلّف بضع مللي ثوانٍ بدل مئة. لا تغيّرها إلا إذا انتقلت قاعدة البيانات.

## النشر على cPanel (استضافة خاصة بدل Vercel)

cPanel يشغّل خادم Node عبر «Setup Node.js App» ولا يبني الموقع. تُبنى الحزمة على جهاز التطوير وتُرفع كما هي:

```
node scripts/build-cpanel.mjs            # ينتج dist-cpanel/aws-cpanel.zip
node scripts/build-cpanel.mjs --assemble # يعيد تجميع آخر بناء بلا بناء جديد
```

- **الحزمة سرّية**: فيها `DATABASE_URL` و`BETTER_AUTH_SECRET` ومفتاح الإشعارات (من `.env.local`). `dist-cpanel/` وكل `*.zip` خارج git ويجب أن تبقى.
- **محتواها**: `server.js` (ملف التشغيل، مصدره `scripts/cpanel/server.js`) و`app.js` (الاسم الافتراضي في cPanel) و`package.json` بلا اعتماديات و`tmp/restart.txt`، ومجلد `app/` فيه خادم Next المستقل (`output: 'standalone'` يُفعَّل بـ `BUILD_STANDALONE=1`) و`.next/static` و`public` و`.env.production` و`.htaccess` يمنع عرض المجلد لو وُضع تحت جذر ويب.
- **على الاستضافة**: تُفك الحزمة في مجلد **خارج** `public_html` (مثل `aws-site`)، ثم Setup Node.js App ← Node 22 (الأدنى 20.9) ← Production ← Application root = المجلد ← Application URL = الدومين الفرعي ← startup file = `server.js`. لا متغيرات بيئة ولا «Run NPM Install».
- **الفحص**: `/api/health` يعرض هل الموقع قائم وهل يصل إلى القاعدة (رمز الخطأ فقط، لا قيم)، وهل الاتصال مشفَّر (`databaseEncrypted`)، وهل تقويم Node سليم (`calendar`)، وأي بناء يجيب (`build` = رقم الإيداع ووقت البناء)، وزمن الوصول للقاعدة (`ms`). `CONNECT_TIMEOUT` (بعد انتظار 15 ثانية) أو `ECONNREFUSED`/`EHOSTUNREACH` = الاستضافة تمنع المنفذ 6543 الخارج إلى `*.pooler.supabase.com`.
- **بعد نجاح الفحص**: احذف ملف zip من الاستضافة نهائياً (مع «Skip the trash») وفعّل Force HTTPS Redirect للدومين.
- **الاتصال بالقاعدة مشفَّر** (`tls` في `lib/db/index.ts`، والحزمة تضيف `sslmode=no-verify`): بلا تحقق من الشهادة — شهادة مجمّع Supabase موقَّعة من CA خاص بهم؛ التحقق الكامل يحتاج شحن ملف ذلك الـ CA.
- **`DB_POOL_MAX=15`** في إعدادات الحزمة (الافتراضي 8 مناسب لدوال Vercel الكثيرة لا لخادم واحد).
- **حدود الاستضافة المشتركة** (غير مجرَّبة): 508 = حد العمليات/الذاكرة (LVE)؛ 403/406 على الحفظ = ModSecurity؛ `.htaccess` الموقع الأصلي قد يتدخل في الدومين الفرعي (الحل `RewriteEngine Off` أول `.htaccess` الدومين الفرعي). الملفات الثابتة تمر كلها عبر عملية Node؛ إن ضاق حد العمليات يمكن نسخ `app/.next/static` إلى `<docroot>/_next/static` ليخدمها خادم الويب نفسه.
- **سجل النسخ الليلي في GitHub** يتوقف بعد 60 يوماً بلا نشاط في المستودع — والنشر على cPanel لا يحتاج push، فلا تدع المستودع يسكن.
- **سبب فشل البدء** يُكتب في `startup-error.log` بجانب `server.js` (سجل الاستضافة نفسه لا يُقرأ من cPanel غالباً).
- **التحديث**: حزمة جديدة ← Stop App ← حذف مجلد `app` ← رفع وفك ← Start App.
- **العنوان** لا يُكتب: الدخول يعمل من أي عنوان يُفتح منه الموقع. يلزم https (كوكي الجلسة آمنة فقط).
- **حدّ محاولات الدخول**: خارج Vercel لا ترويسة عنوان زائر يُوثق بها، فالعدّ للمدرسة كلها في خانة واحدة وبحدود أوسع (`lib/auth.ts`). إن عُرف أن الاستضافة تكتب ترويسة لا يملكها الزائر فاسمها في `AUTH_IP_HEADER` يعيد العدّ لكل زائر.
- **ما جُرِّب وما لم يُجرَّب**: الحزمة جُرِّبت على جهاز التطوير (ويندوز) تشغيلاً مباشراً وبمحاكاة لتحميل Passenger و LiteSpeed (اعتراض `listen` إلى مقبس خاص). لم تُجرَّب على خادم لينكس ولا على cPanel فعلي.
- `vercel.json` وتحليلات Vercel لا أثر لهما خارج Vercel (التحليلات تُحمَّل فقط حين `VERCEL=1`).

## ترقية قاعدة البيانات (قبل رفع الكود)

لا يوجد مجلد ترحيلات: كل عمود جديد يُضاف بأمر SQL على Supabase **قبل** رفع الكود الذي يقرؤه — الكود يسمّي كل أعمدة الجدول، فإن سبق العمودَ سقطت الصفحات. الأوامر كلها إضافة بحتة وتُنفَّذ أكثر من مرة بلا ضرر:

```sql
ALTER TABLE classes ADD COLUMN IF NOT EXISTS extra_promotion_class_ids text;
ALTER TABLE school_holidays ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'holiday';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS live_since text;

CREATE TABLE IF NOT EXISTS absence_excuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  class_id uuid,
  parent_user_id text NOT NULL,
  date text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  decided_by_user_id text,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS absence_excuses_student_date_uq ON absence_excuses (student_id, date);
CREATE INDEX IF NOT EXISTS absence_excuses_school_status_idx ON absence_excuses (school_id, status);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  endpoint text NOT NULL,
  p256dh text,
  auth text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_uq ON push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS timetable_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  weekday integer NOT NULL,
  period integer NOT NULL,
  subject_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS timetable_slots_class_day_period_uq ON timetable_slots (class_id, weekday, period);
CREATE INDEX IF NOT EXISTS timetable_slots_school_idx ON timetable_slots (school_id);
CREATE INDEX IF NOT EXISTS timetable_slots_subject_idx ON timetable_slots (subject_id);
```

مطلوب مرة واحدة ما دامت في القاعدة حسابات أولياء أمور أُنشئت قبل 2026-10-05: اسم الحساب القديم يحمل اسم الطالب كاملاً، ويعود في ردّ تسجيل الدخول لمن يكتب رقم الجوال وكلمة المرور المبدئية. الأمر بيانات بحتة ولا شيء يقرأ الاسم القديم (الحسابات الجديدة تُنشأ باسم محايد؛ ومن صفّر الطلاب والحسابات كلها لا يحتاجه):

```sql
UPDATE "user" SET name = 'ولي الأمر' WHERE role = 'parent';
```

(قاعدة «الكود أولاً ثم البيانات» في CONTEXT.md تخص الترحيلات التي تغيّر **معنى** عمود قائم، لا إضافة عمود جديد.)

## الإشعارات الفورية (مجانية، بلا أي خدمة مدفوعة)

إشعار يظهر على جوال ولي الأمر والموقع مغلق. يعمل بمعيار Web Push المبني في المتصفحات: لا اشتراك ولا حساب عند طرف ثالث ولا مكتبة مضافة — زوج مفاتيح يُولَّد مرة واحدة فقط.

- **بدون المفاتيح الثلاثة أعلاه الميزة مطفأة**: لا يُرسَل شيء، وبطاقة التفعيل في إعدادات ولي الأمر تقول «غير مفعَّلة في النظام بعد». بقية الموقع لا تتأثر.
- المفتاح العام يُدمَج في الموقع وقت البناء: بعد إضافة المتغيرات على Vercel **أعد النشر** (Redeploy).
- المفتاحان موجودان في `.env.local` على جهاز التطوير (غير مرفوع). انسخ القيم نفسها إلى Vercel؛ تغيير المفتاحين لاحقاً يُسقط تفعيل كل الأجهزة ويحتاج كل ولي أمر أن يوقف ثم يفعّل.
- الإشعار نفسه فارغ: لا يمرّ اسم طالب ولا نص عبر خوادم Google أو Apple. الجوال يسأل الموقع عن النص بجلسة صاحبه.
- على الآيفون: يُضاف الموقع إلى الشاشة الرئيسية أولاً (زر المشاركة ← «إضافة إلى الشاشة الرئيسية») ثم يُفعَّل من الإعدادات.

## وضع التجهيز وبدء التشغيل الفعلي

المدرسة تبدأ في **وضع التجهيز** (`schools.live_since` فارغ): تُدخَل المراحل والفصول والمعلمون والطلاب والجداول وتُرسَل رسائل التفعيل، ولا يُسجَّل حضور ولا تُمنح نقاط ولا يُحسب شيء. بطاقة «الموقع في وضع التجهيز» في رئيسية الإدارة فيها زر **«بدء التشغيل الفعلي»** (للمالك ومدير الجودة): يُضبط يوم بداية الدراسة ويُضغط **مرة واحدة**، فيبدأ الحساب من ذلك اليوم وتختفي البطاقة. مسح بيانات التجربة يعيد المدرسة إلى وضع التجهيز.

> ⚠️ بعد إضافة العمود ورفع هذا الكود تصبح أي مدرسة قائمة في وضع التجهيز فوراً (العمود فارغ): يتوقف تسجيل الحضور حتى يُضغط الزر.

## قبل أول يوم حقيقي

1. لوحة الإدارة → بطاقة «ما ينقص المدرسة قبل التشغيل»: أغلق كل بند (معلمو الفصول، توزيع الطلاب، أرقام الهوية، تسجيل العام، الموجه لكل مرحلة).
2. الإعدادات → النسخ الاحتياطي: حمّل نسخة.
3. الإعدادات → «الانتقال من التجربة إلى التشغيل الفعلي» (للمالك وحده): تُمسح سجلات التجربة دائماً (الحضور والحصص والنقاط والدرجات والحالات والإشعارات)، وتختار ما يُمسح معها: الطلاب وحسابات أولياء الأمور، المعلمون وحساباتهم، فريق الإدارة والموجهون (يبقى المالك ومدير الجودة دائماً)، المراحل والفصول والمواد (ومعها الجداول الأسبوعية)، والتقويم والأرشيف وسجل التدقيق. باختيار الخمسة كلها لا يبقى إلا حساب المالك وحساب مدير الجودة وإعدادات النقاط والقوالب. اضغط «معاينة» لترى الأعداد بالضبط ومن يبقى من حسابات الإدارة، ثم اكتب العبارة. بعد أي مسح يعود الموقع إلى وضع التجهيز حتى يُضغط «بدء التشغيل الفعلي». بعدها أضف الأشخاص الفعليين.
4. تفعيل أولياء الأمور: أرسل رسالة التفعيل من صفحتها. **قبلها تأكد أن لكل طالب رقم هوية مسجَّلاً** — ولي الأمر يُسأل عنه عند أول دخول، وحساب بلا رقم لا يُفعَّل (البطاقة في لوحة الإدارة تعدّهم).

## دورياً

- نسخة احتياطية شهرياً على الأقل (اللوحة تذكّرك بعد 30 يوماً).
- في نهاية العام: الأرشيف → «إقفال العام وفتح التالي» يحفظ الملخص ويبدأ العدّ من جديد ويكنس الجداول القديمة.
