"""Tests for mypackage module."""
import pytest
from mypackage import hello, add, multiply, Calculator


def test_hello_default():
    """Test hello function with default parameter."""
    assert hello() == "Hello, World!"


def test_hello_with_name():
    """Test hello function with custom name."""
    assert hello("Alice") == "Hello, Alice!"


def test_add():
    """Test add function."""
    assert add(2, 3) == 5
    assert add(-1, 1) == 0
    assert add(0, 0) == 0


def test_multiply():
    """Test multiply function."""
    assert multiply(2, 3) == 6
    assert multiply(-1, 5) == -5
    assert multiply(0, 10) == 0


class TestCalculator:
    """Tests for Calculator class."""
    
    def test_init(self):
        """Test calculator initialization."""
        calc = Calculator()
        assert calc.result == 0
    
    def test_add(self):
        """Test calculator add method."""
        calc = Calculator()
        assert calc.add(5) == 5
        assert calc.add(3) == 8
    
    def test_subtract(self):
        """Test calculator subtract method."""
        calc = Calculator()
        calc.add(10)
        assert calc.subtract(3) == 7
        assert calc.subtract(2) == 5
    
    def test_clear(self):
        """Test calculator clear method."""
        calc = Calculator()
        calc.add(10)
        calc.clear()
        assert calc.result == 0
