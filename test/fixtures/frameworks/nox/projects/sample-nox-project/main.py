"""Main module for the sample nox project."""


def main():
    """Main entry point for the application."""
    print("Hello from the sample nox project!")
    print("This is a demonstration project for testing nox integration.")
    return "Application completed successfully"


def process_data(data: list) -> list:
    """Process a list of data by doubling each element.
    
    Args:
        data: List of numbers to process
        
    Returns:
        List with each element doubled
    """
    return [x * 2 for x in data]


def format_output(message: str) -> str:
    """Format a message for output.
    
    Args:
        message: The message to format
        
    Returns:
        Formatted message with borders
    """
    border = "=" * (len(message) + 4)
    return f"{border}\n  {message}  \n{border}"


if __name__ == "__main__":
    main()
