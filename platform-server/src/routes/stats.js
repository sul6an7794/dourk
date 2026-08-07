const express = require('express');
const { authMiddleware } = require('../auth');
const stats = require('../stats');

const router = express.Router();

// إحصائياتك الشخصية عبر اللعبتين — الحساب نفسه بيسجّل دخول (authMiddleware)، ما فيه
// وصول لإحصائيات حساب غيرك.
router.get('/', authMiddleware, (req, res) => {
  res.json({
    mafia: stats.getMafia(req.user.id),
    wslha: stats.getWslha(req.user.id),
  });
});

module.exports = router;
