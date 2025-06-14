"""A sample Python package for testing nox integration."""


def hello(name: str = "World") -> str:
    """Return a greeting message.
    
    Args:
        name: The name to greet
        
    Returns:
        A greeting message
    """
    return f"Hello, {name}!"


def add(a: int, b: int) -> int:
    """Add two numbers together.
    
    Args:
        a: First number
        b: Second number
        
    Returns:
        Sum of a and b
    """
    return a + b


def multiply(a: int, b: int) -> int:
    """Multiply two numbers together.
    
    Args:
        a: First number
        b: Second number
        
    Returns:
        Product of a and b
    """
    return a * b


class Calculator:
    """A simple calculator class."""
    
    def __init__(self):
        self.result = 0
    
    def add(self, value: int) -> int:
        """Add a value to the current result."""
        self.result += value
        return self.result
    
    def subtract(self, value: int) -> int:
        """Subtract a value from the current result."""
        self.result -= value
        return self.result
    
    def clear(self) -> None:
        """Reset the calculator to zero."""
        self.result = 0
