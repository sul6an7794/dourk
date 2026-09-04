const express = require('express');
const { authMiddleware } = require('../auth');
const asyncHandler = require('../async-handler');
const stats = require('../stats');

const router = express.Router();

// إحصائياتك الشخصية عبر اللعبتين — الحساب نفسه بيسجّل دخول (authMiddleware)، ما فيه
// وصول لإحصائيات حساب غيرك.
router.get('/', authMiddleware, asyncHandler(async (req, res) => {
  res.json({
    mafia: await stats.getMafia(req.user.id),
    wslha: await stats.getWslha(req.user.id),
  });
}));

module.exports = router;
