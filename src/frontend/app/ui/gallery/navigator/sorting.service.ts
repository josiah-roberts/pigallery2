import {Injectable} from '@angular/core';
import {DatePipe} from '@angular/common';
import {NetworkService} from '../../../model/network/network.service';
import {GalleryCacheService} from '../cache.gallery.service';
import {BehaviorSubject, Observable} from 'rxjs';
import {Config} from '../../../../../common/config/public/Config';
import {SortingByTypes, SortingMethod} from '../../../../../common/entities/SortingMethods';
import {PG2ConfMap} from '../../../../../common/PG2ConfMap';
import {ContentService, DirectoryContent} from '../content.service';
import {PhotoDTO} from '../../../../../common/entities/PhotoDTO';
import {map, switchMap} from 'rxjs/operators';
import {SeededRandomService} from '../../../model/seededRandom.service';
import {ContentWrapper} from '../../../../../common/entities/ConentWrapper';
import {SubDirectoryDTO} from '../../../../../common/entities/DirectoryDTO';
import {MediaDTO} from '../../../../../common/entities/MediaDTO';
import {FileDTO} from '../../../../../common/entities/FileDTO';

@Injectable()
export class GallerySortingService {
  public sorting: BehaviorSubject<SortingMethod>;
  public grouping: BehaviorSubject<SortingMethod>;
  private collator = new Intl.Collator(undefined, {numeric: true});

  constructor(
    private networkService: NetworkService,
    private galleryCacheService: GalleryCacheService,
    private galleryService: ContentService,
    private rndService: SeededRandomService,
    private datePipe: DatePipe
  ) {
    this.sorting = new BehaviorSubject(
      {method: Config.Gallery.defaultPhotoSortingMethod.method, ascending: Config.Gallery.defaultPhotoSortingMethod.ascending}
    );
    this.grouping = new BehaviorSubject(
      {method: Config.Gallery.defaultPhotoSortingMethod.method, ascending: Config.Gallery.defaultPhotoSortingMethod.ascending}
    );
    this.galleryService.content.subscribe((c) => {
      if (c) {
        const sort = this.galleryCacheService.getSorting(c);
        if (sort !== null) {
          this.sorting.next(sort);
          return;
        }
      }
      this.sorting.next(this.getDefaultSorting(c));
    });
  }

  isDefaultSortingAndGrouping(cw: ContentWrapper): boolean {
    const defS = this.getDefaultSorting(cw);
    const defG = this.getDefaultGrouping(cw);
    const s = this.sorting.value;
    const g = this.grouping.value;
    return s.method === defS.method && s.ascending === defS.ascending &&
      g.method === defG.method && g.ascending === defG.ascending;
  }

  getDefaultSorting(cw: ContentWrapper): SortingMethod {
    if (cw.directory && cw.directory.metaFile) {
      for (const file in PG2ConfMap.sorting) {
        if (cw.directory.metaFile.some((f) => f.name === file)) {
          return (PG2ConfMap.sorting as any)[file];
        }
      }
    }
    if (cw.searchResult) {
      return Config.Gallery.defaultSearchSortingMethod;
    }
    return Config.Gallery.defaultPhotoSortingMethod;
  }


  getDefaultGrouping(cw: ContentWrapper): SortingMethod {
    if (cw.searchResult) {
      return Config.Gallery.defaultSearchGroupingMethod;
    }
    return Config.Gallery.defaultPhotoGroupingMethod;
  }

  setSorting(sorting: SortingMethod): void {
    this.sorting.next(sorting);
    if (this.galleryService.content.value) {
      if (
        sorting !==
        this.getDefaultSorting(this.galleryService.content.value)
      ) {
        this.galleryCacheService.setSorting(
          this.galleryService.content.value,
          sorting
        );
      } else {
        this.galleryCacheService.removeSorting(
          this.galleryService.content.value
        );
      }
    }
  }

  setGrouping(grouping: SortingMethod): void {
    this.grouping.next(grouping);
  }

  private sortMedia(sorting: SortingMethod, media: MediaDTO[]): void {
    if (!media) {
      return;
    }
    switch (sorting.method) {
      case SortingByTypes.Name:
        media.sort((a: PhotoDTO, b: PhotoDTO) =>
          this.collator.compare(a.name, b.name)
        );
        break;
        break;
      case SortingByTypes.Date:
        media.sort((a: PhotoDTO, b: PhotoDTO): number => {
          return a.metadata.creationDate - b.metadata.creationDate;
        });
        break;
      case SortingByTypes.Rating:
        media.sort(
          (a: PhotoDTO, b: PhotoDTO) =>
            (a.metadata.rating || 0) - (b.metadata.rating || 0)
        );
        break;
      case SortingByTypes.PersonCount:
        media.sort(
          (a: PhotoDTO, b: PhotoDTO) =>
            (a.metadata?.faces?.length || 0) - (b.metadata?.faces?.length || 0)
        );
        break;
      case SortingByTypes.random:
        this.rndService.setSeed(media.length);
        media.sort((a: PhotoDTO, b: PhotoDTO): number => {
          if (a.name.toLowerCase() < b.name.toLowerCase()) {
            return -1;
          }
          if (a.name.toLowerCase() > b.name.toLowerCase()) {
            return 1;
          }
          return 0;
        })
          .sort((): number => {
            return this.rndService.get() - 0.5;
          });
        break;
    }
    if (!sorting.ascending) {
      media.reverse();
    }
    return;
  }

  public applySorting(
    directoryContent: Observable<DirectoryContent>
  ): Observable<GroupedDirectoryContent> {
    return directoryContent.pipe(
      switchMap((dirContent) => {
        return this.grouping.pipe(
          switchMap((grouping) => {
            return this.sorting.pipe(
              map((sorting) => {
                if (!dirContent) {
                  return null;
                }
                const c: GroupedDirectoryContent = {
                  mediaGroups: [],
                  directories: dirContent.directories,
                  metaFile: dirContent.metaFile,
                };
                if (c.directories) {
                  switch (sorting.method) {
                    case SortingByTypes.Rating: // directories do not have rating
                    case SortingByTypes.Name:
                      c.directories.sort((a, b) =>
                        this.collator.compare(a.name, b.name)
                      );
                      break;
                    case SortingByTypes.Date:
                      if (
                        Config.Gallery.enableDirectorySortingByDate === true
                      ) {
                        c.directories.sort(
                          (a, b) => a.lastModified - b.lastModified
                        );
                        break;
                      }
                      c.directories.sort((a, b) =>
                        this.collator.compare(a.name, b.name)
                      );
                      break;
                    case SortingByTypes.random:
                      this.rndService.setSeed(c.directories.length);
                      c.directories
                        .sort((a, b): number => {
                          if (a.name.toLowerCase() < b.name.toLowerCase()) {
                            return 1;
                          }
                          if (a.name.toLowerCase() > b.name.toLowerCase()) {
                            return -1;
                          }
                          return 0;
                        })
                        .sort((): number => {
                          return this.rndService.get() - 0.5;
                        });
                      break;
                  }

                  if (!sorting.ascending) {
                    c.directories.reverse();
                  }
                }

                // group
                if (dirContent.media) {
                  const mCopy = dirContent.media;
                  this.sortMedia(grouping, mCopy);
                  let groupFN = (m: MediaDTO) => '';
                  switch (grouping.method) {
                    case SortingByTypes.Date:
                      groupFN = (m: MediaDTO) => this.datePipe.transform(m.metadata.creationDate, 'longDate');
                      break;
                    case SortingByTypes.Name:
                      groupFN = (m: MediaDTO) => m.name.at(0).toUpperCase();
                      break;
                    case SortingByTypes.Rating:
                      groupFN = (m: MediaDTO) => ((m as PhotoDTO).metadata.rating || 0).toString();
                      break;
                    case SortingByTypes.PersonCount:
                      groupFN = (m: MediaDTO) => ((m as PhotoDTO).metadata.faces || []).length.toString();
                      break;
                  }
                  c.mediaGroups = [];
                  for (const m of mCopy) {
                    const k = groupFN(m);
                    if (c.mediaGroups.length == 0 || c.mediaGroups[c.mediaGroups.length - 1].name != k) {
                      c.mediaGroups.push({name: k, media: []});
                    }
                    c.mediaGroups[c.mediaGroups.length - 1].media.push(m);
                  }
                  c.mediaGroups;
                }

                // sort groups
                for (let i = 0; i < c.mediaGroups.length; ++i) {
                  this.sortMedia(sorting, c.mediaGroups[i].media);
                }

                return c;
              })
            );
          })
        );
      })
    );
  }
}

export interface MediaGroup {
  name: string;
  media: MediaDTO[];
}

export interface GroupedDirectoryContent {
  directories: SubDirectoryDTO[];
  mediaGroups: MediaGroup[];
  metaFile: FileDTO[];
}


