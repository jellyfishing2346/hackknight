from flask import Flask
from werkzeug.exceptions import HTTPException

from backend.routes.verify import bp as verify_bp


def create_app():
    app = Flask(__name__)
    # No request body we expect is anywhere near this size; cap it so /api/verify
    # can't be used to make the server read/parse something huge.
    app.config["MAX_CONTENT_LENGTH"] = 16 * 1024  # 16 KB

    app.register_blueprint(verify_bp)

    @app.get("/health")
    def health():
        return {"status": "ok"}, 200

    @app.errorhandler(Exception)
    def handle_unexpected_error(err):
        # Let normal HTTP errors (404, 405, 413 from MAX_CONTENT_LENGTH, ...) through
        # with their real status codes; only mask truly unexpected exceptions.
        if isinstance(err, HTTPException):
            return err
        app.logger.exception("Unhandled error")
        return {"error": "Internal server error."}, 500

    return app


app = create_app()
