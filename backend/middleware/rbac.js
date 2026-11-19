function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.vaiTro)) {
      return res
        .status(403)
        .json({ error: "Bạn không có quyền thực hiện thao tác này" });
    }
    next();
  };
}
module.exports = { requireRole };
