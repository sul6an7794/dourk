const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, adminMiddleware } = require('../auth');
const { rateLimit } = require('../rateLimit');
const asyncHandler = require('../async-handler');

const adminLimit = rateLimit(120, 60 * 1000, 'admin'); // 120 طلب بالدقيقة لكل IP — كافٍ للاستخدام العادي، يمنع إساءة الاستخدام

router.use(adminLimit, authMiddleware, adminMiddleware);

// ---- إدارة المستخدمين (للمشرف) ----
router.get('/users', (req, res) => {
  res.json(db.getAllUsers());
});

// تعديل رصيد و/أو صلاحية مشرف لمستخدم. المشرف لا يقدر ينزّل صلاحية نفسه (تفاديًا للقفل).
router.patch('/users/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const target = db.getUserById(id);
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
  const { credits, isAdmin } = req.body || {};
  if (credits != null) {
    const n = Number(credits);
    if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'قيمة رصيد غير صحيحة' });
    await db.setUserCredits(id, n, 'admin-adjustment', req.user.id);
  }
  if (isAdmin != null) {
    if (id === req.user.id && !isAdmin) {
      return res.status(400).json({ error: 'لا يمكنك إزالة صلاحية المشرف عن نفسك' });
    }
    await db.setUserAdmin(id, !!isAdmin);
  }
  const u = db.getUserById(id);
  res.json({ id: u.id, username: u.username, isAdmin: !!u.is_admin, credits: u.credits || 0, created_at: u.created_at });
}));

// سجل حركة رصيد التذاكر لمستخدم معيّن — يفيد المشرف لو حد اشتكى "ليش انخصمت مني تذكرة".
router.get('/users/:id/credits-log', (req, res) => {
  const id = Number(req.params.id);
  if (!db.getUserById(id)) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json({ log: db.getCreditLog(id) });
});

// حذف مستخدم — لا يقدر المشرف يحذف نفسه.
router.delete('/users/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'لا يمكنك حذف حسابك أنت' });
  }
  const ok = await db.deleteUser(id);
  if (!ok) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json({ ok: true });
}));

module.exports = router;
