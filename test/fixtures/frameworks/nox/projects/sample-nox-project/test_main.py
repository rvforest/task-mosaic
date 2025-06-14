"""Tests for main module."""
from main import main, process_data, format_output


def test_main():
    """Test main function."""
    result = main()
    assert result == "Application completed successfully"


def test_process_data():
    """Test process_data function."""
    assert process_data([1, 2, 3]) == [2, 4, 6]
    assert process_data([]) == []
    assert process_data([0, -1, 5]) == [0, -2, 10]


def test_format_output():
    """Test format_output function."""
    result = format_output("Hello")
    expected = "===========\n  Hello  \n==========="
    assert result == expected
    
    result = format_output("Test")
    expected = "==========\n  Test  \n=========="
    assert result == expected
