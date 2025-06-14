import nox
import sys


nox.options.sessions = ["tests", "lint"]


@nox.session(python=["3.11", "3.12", "3.13"], tags=["test", "ci"])
def tests(session):
    session.install("pytest")
    session.run("pytest", "test_main.py")


@nox.session(tags=["quality", "ci"])
def lint(session):
    session.install("ruff")
    session.run("ruff", "check", "main.py")


@nox.session(python=["3.11", "3.12", "3.13"], tags=["test"])
def always_fail(session):
    """This session always fails for testing error handling."""
    session.log("This session is designed to fail")
    sys.exit(1)


@nox.session(tags=["demo"])
def always_skip(session):
    """This session is always skipped to demonstrate the skip functionality."""
    session.skip("This session is intentionally skipped for demonstration purposes")


@nox.session(python=["3.11", "3.12", "3.13"], tags=["test", "matrix"])
@nox.parametrize("param1", ["value1", "value2"])
@nox.parametrize("param2", ["optionA", "optionB"])
def test_parametrize(session, param1, param2):
    """A parametrized session that demonstrates using multiple parameters with a Python version matrix."""
    session.run("echo", f"Python: {session.python}, Param1: {param1}, Param2: {param2}")


@nox.session(default=False)
def non_default_session(session):
    """A session that is not run by default."""
    session.log("This is a non-default session that won't run unless specified.")
    session.run("echo", "Non-default session executed")


@nox.session(tags=["demo"])
def echo_args(session):
    """A session that demonstrates using positional arguments passed via --."""
    if session.posargs:
        session.log(f"Received positional arguments: {session.posargs}")
        session.run("echo", "Arguments received:", *session.posargs)
    else:
        session.log("No positional arguments provided")
        session.run("echo", "No arguments - try running with: nox -s echo_args -- hello world")


@nox.session(tags=["docs"])
def docs(session):
    """Build documentation for the project."""
    session.install("sphinx", "sphinx-rtd-theme")
    session.log("Building documentation...")
    session.run("echo", "Documentation build would run here")
    session.log("Documentation build completed successfully")