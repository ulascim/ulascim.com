import random

cash, position, FEE = 10000, 0, 0.001

for close in prices:
    dice = random.randint(1, 6)
    
    if dice <= 2:  # 1-2: BUY
        if cash > 0:
            position = cash * (1 - FEE) / close
            cash = 0
    elif dice >= 5:  # 5-6: SELL
        if position > 0:
            cash = position * close * (1 - FEE)
            position = 0
    # 3-4: HOLD (do nothing)

final = cash + position * prices[-1]
