import random

cash, position, FEE = 10000, 0, 0.001

for close in prices:
    if random.random() < 0.5:  # HEADS → want IN
        if cash > 0:
            position = cash * (1 - FEE) / close
            cash = 0
    else:  # TAILS → want OUT
        if position > 0:
            cash = position * close * (1 - FEE)
            position = 0

final = cash + position * prices[-1]
