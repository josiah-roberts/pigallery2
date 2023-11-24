import {Component, OnDestroy, OnInit} from '@angular/core';
import {RouterLink} from '@angular/router';
import { Filter, FilterService, FilterState, FilterType, SelectedFilter} from './filter.service';

@Component({
  selector: 'app-gallery-filter',
  styleUrls: ['./filter.gallery.component.css'],
  templateUrl: './filter.gallery.component.html',
  providers: [RouterLink],
})
export class GalleryFilterComponent implements OnInit, OnDestroy {
  public readonly unknownText;
  minDate = 0;
  maxDate = 100;
  NUMBER_MAX_VALUE = Number.MAX_VALUE;
  NUMBER_MIN_VALUE = Number.MIN_VALUE;
  showStatistic = false;

  constructor(public filterService: FilterService) {
    this.unknownText = '<' + $localize`unknown` + '>';
  }

  get MinDatePrc(): number {
    return (
        ((this.ActiveFilters.dateFilter.minFilter -
                this.ActiveFilters.dateFilter.minDate) /
            (this.ActiveFilters.dateFilter.maxDate -
                this.ActiveFilters.dateFilter.minDate)) *
        100
    );
  }

  get MaxDatePrc(): number {
    return (
        ((this.ActiveFilters.dateFilter.maxFilter -
                this.ActiveFilters.dateFilter.minDate) /
            (this.ActiveFilters.dateFilter.maxDate -
                this.ActiveFilters.dateFilter.minDate)) *
        100
    );
  }

  get ActiveFilters(): FilterState {
    return this.filterService.filterState.value;
  }

  filterChanged(index: number, newFilter: Filter) {
    this.filterService.filterState.value.selectedFilters[index] = {
      type: newFilter.key,
      options: {}
    }
    this.filterService.onFilterChange();
  }

  toggleFilterValue(filter: SelectedFilter, value: string) {
    filter.options[value] = !filter.options[value];
    this.filterService.onFilterChange();
  }

  options(filter: SelectedFilter) {
    const entries = Object.entries(filter.options).map(([k, v]) => ({selected: v, name: k}))
    return entries.sort((a, b) => this.filterService.filterState.value.filterValueCounts[filter.type][b.name] - this.filterService.filterState.value.filterValueCounts[filter.type][a.name])
  }

  ngOnDestroy(): void {
    setTimeout(() => this.filterService.setShowingFilters(false));
  }

  ngOnInit(): void {
    this.filterService.setShowingFilters(true);
  }

  isOnlySelected(filter: SelectedFilter, option: string): boolean {
    const selectedEntries = Object.entries(filter.options).filter(([, selected]) => selected);
    return selectedEntries.length === 1 && filter.options[option];
  }

  toggleSelectOnly(
      filter: SelectedFilter,
      option: string,
      event: MouseEvent
  ): void {
    if (this.isOnlySelected(filter, option)) {
      Object.keys(filter.options).forEach((o) => filter.options[o] = true);
    } else {
      Object.keys(filter.options).forEach((o) => filter.options[o] = o === option);
    }
    event.stopPropagation();
    this.filterService.onFilterChange();
  }

  newMinDate($event: Event): void {
    const diff =
        (this.ActiveFilters.dateFilter.maxDate -
            this.ActiveFilters.dateFilter.minDate) *
        0.01;
    if (
        this.ActiveFilters.dateFilter.minFilter >
        this.ActiveFilters.dateFilter.maxFilter - diff
    ) {
      this.ActiveFilters.dateFilter.minFilter = Math.max(
          this.ActiveFilters.dateFilter.maxFilter - diff,
          this.ActiveFilters.dateFilter.minDate
      );
    }
    this.filterService.onFilterChange();
  }

  newMaxDate($event: Event): void {
    const diff =
        (this.ActiveFilters.dateFilter.maxDate -
            this.ActiveFilters.dateFilter.minDate) *
        0.01;
    if (
        this.ActiveFilters.dateFilter.maxFilter <
        this.ActiveFilters.dateFilter.minFilter + diff
    ) {
      this.ActiveFilters.dateFilter.maxFilter = Math.min(
          this.ActiveFilters.dateFilter.minFilter + diff,
          this.ActiveFilters.dateFilter.maxDate
      );
    }
    this.filterService.onFilterChange();
  }

  reset(): void {
    this.filterService.resetFilters();
  }
}

