      event.preventDefault();
      day.click();
      requestAnimationFrame(refreshCalendars);
      return;
    }

    const index = days.indexOf(day);
    let targetIndex;
    if (event.key === 'ArrowLeft') targetIndex = index - 1;
    else if (event.key === 'ArrowRight') targetIndex = index + 1;
    else if (event.key === 'ArrowUp') targetIndex = index - 7;
    else if (event.key === 'ArrowDown') targetIndex = index + 7;
    else if (event.key === 'Home') targetIndex = days.findIndex(item => !item.classList.contains('other-month'));
    else if (event.key === 'End') targetIndex = days.length - 1;
    else return;

    event.preventDefault();

    let target = days[targetIndex];
    const direction = targetIndex < index ? -1 : 1;
    while (target && target.classList.contains('other-month')) {
      targetIndex += direction;
      target = days[targetIndex];
    }

    if (!target || target.classList.contains('other-month')) return;
    days.forEach(item => { item.tabIndex = item === target ? 0 : -1; });
    target.focus({ preventScroll: true });
  }
