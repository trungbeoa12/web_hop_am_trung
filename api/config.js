module.exports = (req, res) => {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.status(200).json({
        apiBaseUrl: process.env.API_BASE_URL || ""
    });
};
