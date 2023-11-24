import {Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {PhotoDTO} from '../../../../../common/entities/PhotoDTO';
import {DirectoryContent} from '../contentLoader.service';
import {debounceTime, map, switchMap} from 'rxjs/operators';
import { Filters } from 'fluent-ffmpeg';

export enum FilterRenderType {
  enum = 1,
  range = 2,
}

const filters = {
  keywords: {
    key: 'keywords',
    name: $localize`Keywords`,
    mapFn: (m: PhotoDTO): string[] => m.metadata.keywords,
    renderType: FilterRenderType.enum,
    isArrayValue: true,
  },
 faces: {
  key: 'faces',
    name: $localize`Faces`,
    mapFn: (m: PhotoDTO): string[] =>
      m.metadata.faces
        ? m.metadata.faces.map((f) => f.name)
        : ['<' + $localize`no face` + '>'],
    renderType: FilterRenderType.enum,
    isArrayValue: true,
  },
  faces_groups: {
    key: 'faces_groups',
    name: $localize`Faces groups`,
    mapFn: (m: PhotoDTO): string =>
      m.metadata.faces
        ?.map((f) => f.name)
        .sort()
        .join(', '),
    renderType: FilterRenderType.enum,
    isArrayValue: false,
  },
  caption: {
    key: 'caption',
    name: $localize`Caption`,
    mapFn: (m: PhotoDTO): string => m.metadata.caption,
    renderType: FilterRenderType.enum,
  },
  rating: {
    key: 'rating',
    name: $localize`Rating`,
    mapFn: (m: PhotoDTO): string => String(m.metadata.rating),
    renderType: FilterRenderType.enum,
  },
 camera: {
  key: 'camera',
    name: $localize`Camera`,
    mapFn: (m: PhotoDTO): string => m.metadata.cameraData?.model,
    renderType: FilterRenderType.enum,
  },
  lens: {
    key: 'lens',
    name: $localize`Lens`,
    mapFn: (m: PhotoDTO): string => m.metadata.cameraData?.lens,
    renderType: FilterRenderType.enum,
  },
 city: {
  key: 'city',
    name: $localize`City`,
    mapFn: (m: PhotoDTO): string => m.metadata.positionData?.city,
    renderType: FilterRenderType.enum,
  },
  state: {
    key: 'state',
    name: $localize`State`,
    mapFn: (m: PhotoDTO): string => m.metadata.positionData?.state,
    renderType: FilterRenderType.enum,
  },
  country: {
    key: 'country',
    name: $localize`Country`,
    mapFn: (m: PhotoDTO): string => m.metadata.positionData?.country,
    renderType: FilterRenderType.enum,
  },
} as const;

type ActiveFilters = {
  filtersVisible: boolean;
  areFiltersActive: boolean;
  dateFilter: {
    minDate: number;
  maxDate: number;
  minFilter: number;
  maxFilter: number;
  };
  selectedFilters: {
    type: keyof typeof filters;
    options: Record<string, boolean>;
  }[]
}

export interface Filter {
  name: string;
  mapFn: (m: PhotoDTO) => (string | number)[] | (string | number);
  renderType: FilterRenderType;
  isArrayValue?: boolean;
}

export interface FilterOption {
  name: string;
  count: number;
  selected: boolean;
}

export interface SelectedFilter {
  filter: Filter;
  options: FilterOption[];
}

@Injectable()
export class FilterService {
  public readonly activeFilters = new BehaviorSubject<ActiveFilters>({
    filtersVisible: false,
    areFiltersActive: false,
    dateFilter: {
      minDate: 0,
      maxDate: Date.now(),
      minFilter: Number.MIN_VALUE,
      maxFilter: Number.MAX_VALUE,
    },
    selectedFilters: [
      {
        type: 'keywords',
        options: {},
      },
      {
        type: 'faces',
        options: {},
      },
      {
        type: 'city',
        options: {},
      },
      {
        type: 'rating',
        options: {},
      },
    ],
  });
  public statistic: { date: Date; endDate: Date; dateStr: string; count: number; max: number; }[] = [];

  private getStatistic(prefiltered: DirectoryContent): { date: Date, endDate: Date, dateStr: string, count: number, max: number }[] {
    if (!prefiltered ||
      !prefiltered.media ||
      prefiltered.media.length === 0) {
      return [];
    }
    const ret: { date: Date, endDate: Date, dateStr: string, count: number, max: number }[] = [];
    const minDate = prefiltered.media.reduce(
      (p, curr) => Math.min(p, curr.metadata.creationDate),
      Number.MAX_VALUE - 1
    );
    const maxDate = prefiltered.media.reduce(
      (p, curr) => Math.max(p, curr.metadata.creationDate),
      Number.MIN_VALUE + 1
    );
    const diff = (maxDate - minDate) / 1000;
    const H = 60 * 60;
    const D = H * 24;
    const M = D * 30;
    const Y = D * 365;
    const Y2 = Y * 2;
    const Y5 = Y * 5;
    const Dec = Y * 10;
    const Dec2 = Y * 20;
    const Dec5 = Y * 50;
    const Sen = Y * 100;
    const divs = [H, D, M, Y, Y2, Y5, Dec, Dec2, Dec5, Sen];

    // finding the resolution
    let usedDiv = H;
    for (let i = 0; i < divs.length; ++i) {
      if (diff / divs[i] < 26) {
        usedDiv = divs[i];
        break;
      }
    }

    // getting the first date (truncated to the resolution)
    const floorDate = (ts: number): number => {
      let d = new Date(ts);
      if (usedDiv >= Y) {
        const fy = (d.getFullYear());
        d = new Date(fy - fy % (usedDiv / Y), 0, 1);
      } else if (usedDiv === M) {
        d = new Date(d.getFullYear(), d.getMonth(), 1);
      } else {
        d = new Date(ts - ts % usedDiv);
      }
      return d.getTime();
    };

    const startMediaDate = new Date(floorDate(minDate));

    prefiltered.media.forEach(m => {
      const key = Math.floor((floorDate(m.metadata.creationDate) - startMediaDate.getTime()) / 1000 / usedDiv);

      const getDate = (index: number) => {
        let d: Date;
        if (usedDiv >= Y) {
          d = new Date(startMediaDate.getFullYear() + (index * (usedDiv / Y)), 0, 1);
        } else if (usedDiv === M) {
          d = new Date(startMediaDate.getFullYear(), startMediaDate.getMonth() + index, 1);
        } else if (usedDiv === D) {
          d = new Date(startMediaDate.getFullYear(), startMediaDate.getMonth(), startMediaDate.getDate() + index, 1);
        } else {
          d = (new Date(startMediaDate.getTime() + (index * usedDiv * 1000)));
        }
        return d;
      };
      // extending the array
      while (ret.length <= key) {
        let dStr: string;
        // getting date range start for entry and also UI date pattern
        if (usedDiv >= Y) {
          dStr = 'y';
        } else if (usedDiv === M) {
          dStr = 'y MMM';
        } else if (usedDiv === D) {
          dStr = 'EEE';
        } else {
          dStr = 'HH';
        }
        ret.push({date: getDate(ret.length), endDate: getDate(ret.length + 1), dateStr: dStr, count: 0, max: 0});
      }

      ret[key].count++;
    });

    // don't show if there is only one column
    if (ret.length <= 1) {
      return [];
    }

    const max = ret.reduce((p, c) => Math.max(p, c.count), 0);
    ret.forEach(v => v.max = max);
    return ret;
  }

  public applyFilters(
    directoryContent: Observable<DirectoryContent>
  ): Observable<DirectoryContent> {
    return directoryContent.pipe(
      switchMap((dirContent: DirectoryContent) => {
        this.statistic = this.getStatistic(dirContent);
        this.resetFilters(false);
        return this.activeFilters.pipe(
          map((afilters) => {
            if (!dirContent || !dirContent.media || (!afilters.filtersVisible && !afilters.areFiltersActive)) {
              return dirContent;
            }



            // clone, so the original won't get overwritten
            const c = {
              media: dirContent.media,
              directories: dirContent.directories,
              metaFile: dirContent.metaFile,
            };

            /* Date Selector */
            if (c.media.length > 0) {
              // Update date filter range
              afilters.dateFilter.minDate = c.media.reduce(
                (p, curr) => Math.min(p, curr.metadata.creationDate),
                Number.MAX_VALUE - 1
              );
              afilters.dateFilter.maxDate = c.media.reduce(
                (p, curr) => Math.max(p, curr.metadata.creationDate),
                Number.MIN_VALUE + 1
              );
              // Add a few sec padding
              afilters.dateFilter.minDate -= (afilters.dateFilter.minDate % 1000) + 1000;
              afilters.dateFilter.maxDate += (afilters.dateFilter.maxDate % 1000) + 1000;

              if (afilters.dateFilter.minFilter === Number.MIN_VALUE) {
                afilters.dateFilter.minFilter = afilters.dateFilter.minDate;
              }
              if (afilters.dateFilter.maxFilter === Number.MAX_VALUE) {
                afilters.dateFilter.maxFilter = afilters.dateFilter.maxDate;
              }

              // Apply Date filter
              c.media = c.media.filter(
                (m) =>
                  m.metadata.creationDate >= afilters.dateFilter.minFilter &&
                  m.metadata.creationDate <= afilters.dateFilter.maxFilter
              );
            } else {
              afilters.dateFilter.minDate = Number.MIN_VALUE;
              afilters.dateFilter.maxDate = Number.MAX_VALUE;
              afilters.dateFilter.minFilter = Number.MIN_VALUE;
              afilters.dateFilter.maxFilter = Number.MAX_VALUE;
            }

            // this needs to:
            // Build an array with all of the selected filter values for all of the media
            // Build a map with the counts of all of the selected filter values for all of the media
            // Build a map with all of the filter selections, including considering the unknown ones
            // Finally, filter the media accordingly
            // And update the filter selections with those defaults

            const valueMap = new Map(afilters.selectedFilters.map(({type})=> {
              const valuesForThisMedia = c.media.flatMap(media => {
                const valuesForThisFilter = filters[type].mapFn(media as PhotoDTO);
                return Array.isArray(valuesForThisFilter) ? valuesForThisFilter : [valuesForThisFilter];
              })
              const counts = new Map<string, number>();
              for (const value of valuesForThisMedia) {
                counts.set(value, (counts.get(value) ?? 0) + 1)
              }
              return [type, counts] as const;
            }));

            // If any options exist that are not in the current selection, default
            // them to selected.
            const selectedOptions = new Map(afilters.selectedFilters.map(f => [f.type, ({
              ...Object.fromEntries([...valueMap.get(f.type).keys()].map(([k]) => [k, true])),
              ...f.options,
            })]));

   

            // filters
            for (const f of afilters.selectedFilters) {
              c.media = c.media.filter(media => {
                const valuesForThisFilter = filters[f.type].mapFn(media as PhotoDTO);
                const normalizedArray = Array.isArray(valuesForThisFilter) ? valuesForThisFilter : [valuesForThisFilter];
                return selectedOptions.get(f.type)?.
              })
            
              f.options = Object.values(valueMap)
                .filter((o) => o.count > 0)
                .sort((a, b) => b.count - a.count);

              /* Apply filters */
              f.options.forEach((opt) => {
                if (opt.selected) {
                  return;
                }
                if (f.filter.isArrayValue) {
                  c.media = c.media.filter((m) => {
                    const mapped = f.filter.mapFn(m as PhotoDTO) as string[];
                    if (!mapped) {
                      return true;
                    }
                    return mapped.indexOf(opt.name) === -1;
                  });
                } else {
                  c.media = c.media.filter(
                    (m) =>
                      (f.filter.mapFn(m as PhotoDTO) as string) !== opt.name
                  );
                }
              });
            }
            // If the number of photos did not change, the filters are not active
            afilters.areFiltersActive = c.media.length !== dirContent.media.length;
            return c;
          })
        );
      })
    );
  }

  public onFilterChange(): void {
    this.activeFilters.next(this.activeFilters.value);
  }

  setShowingFilters(value: boolean): void {
    if (this.activeFilters.value.filtersVisible === value) {
      return;
    }
    this.activeFilters.value.filtersVisible = value;
    if ((!this.activeFilters.value.filtersVisible && !this.activeFilters.value.areFiltersActive)) {
      this.resetFilters(false);
    }
    this.onFilterChange();
  }

  resetFilters(triggerChangeDetection = true): void {
    this.activeFilters.value.dateFilter.minFilter = Number.MIN_VALUE;
    this.activeFilters.value.dateFilter.maxFilter = Number.MAX_VALUE;
    this.activeFilters.value.selectedFilters.forEach((f) => (f.options = []));
    if (triggerChangeDetection) {
      this.onFilterChange();
    }
  }
}


