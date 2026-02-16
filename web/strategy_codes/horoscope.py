cash, position, FEE = 10000, 0, 0.001

for timestamp, close, net_direction in data:
    
    # COSMIC TRADING LOGIC:
    # Planets pulling NORTH (+) = BUY
    # Planets pulling SOUTH (-) = SELL
    
    if net_direction > 0:
        if cash > 0:
            position = cash * (1 - FEE) / close
            cash = 0
    else:
        if position > 0:
            cash = position * close * (1 - FEE)
            position = 0

final = cash + position * data[-1][1]
