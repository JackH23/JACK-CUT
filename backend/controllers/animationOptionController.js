const AnimationOption = require("../models/AnimationOption");

async function getAnimationOptions(req, res) {
  try {
    const page = Math.max(
      parseInt(req.query.page, 10) || 1,
      1,
    );

    const limit = Math.min(
      Math.max(
        parseInt(req.query.limit, 10) || 10,
        1,
      ),
      100,
    );

    const offset = (page - 1) * limit;

    const { count, rows } =
      await AnimationOption.findAndCountAll({
        where: {
          is_active: true,
        },

        order: [
          ["sort_order", "ASC"],
          ["name", "ASC"],
        ],

        limit,
        offset,
      });

    const totalPages = Math.ceil(
      count / limit,
    );

    return res.status(200).json({
      total: count,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      animationOptions: rows,
    });
  } catch (error) {
    console.error(
      "Get animation options error:",
      error,
    );

    return res.status(500).json({
      message:
        "Could not load animation options.",
    });
  }
}

module.exports = {
  getAnimationOptions,
};