import random

cash, position, FEE = 10000, 0, 0.001

# Classic Magic 8-Ball responses mapped to actions
RESPONSES = [
    "BUY",   # It is certain
    "BUY",   # Without a doubt
    "BUY",   # Yes definitely
    "BUY",   # You may rely on it
    "BUY",   # As I see it, yes
    "HOLD",  # Reply hazy try again
    "HOLD",  # Ask again later
    "HOLD",  # Better not tell you now
    "HOLD",  # Cannot predict now
    "HOLD",  # Concentrate and ask again
    "HOLD",  # Most likely (but wait)
    "HOLD",  # Outlook good (but wait)
    "HOLD",  # Signs point to yes (but wait)
    "HOLD",  # Yes (but wait)
    "SELL",  # Don't count on it
    "SELL",  # My reply is no
    "SELL",  # My sources say no
    "SELL",  # Outlook not so good
    "SELL",  # Very doubtful
    "SELL",  # No way
]

for close in prices:
    answer = random.choice(RESPONSES)
    
    if answer == "BUY":
        if cash > 0:
            position = cash * (1 - FEE) / close
            cash = 0
    elif answer == "SELL":
        if position > 0:
            cash = position * close * (1 - FEE)
            position = 0

final = cash + position * prices[-1]
