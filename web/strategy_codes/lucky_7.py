cash, position, FEE = 10000, 0, 0.001

for close in prices:
    last_digit = int(close * 100) % 10  # last digit of price (cents)
    
    if last_digit == 7:  # Lucky 7 = BUY
        if cash > 0:
            position = cash * (1 - FEE) / close
            cash = 0
    elif last_digit == 3:  # Unlucky 3 = SELL
        if position > 0:
            cash = position * close * (1 - FEE)
            position = 0

final = cash + position * prices[-1]
