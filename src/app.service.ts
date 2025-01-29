import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class GeoLocationService {
  constructor(private readonly httpService: HttpService, ) {}

  private generateBoundingBox(latitude: number, longitude: number, offset: number = 0.05) {
    return {
      lowerLatitude: latitude - offset,
      lowerLongitude: longitude - offset,
      upperLatitude: latitude + offset,
      upperLongitude: longitude + offset,
    };
  }

  private moveToNextBox(latitude: number, longitude: number, direction: 'north' | 'south' | 'east' | 'west', step: number) {
    switch (direction) {
      case 'north': return { lat: latitude + step, lng: longitude };
      case 'south': return { lat: latitude - step, lng: longitude };
      case 'east': return { lat: latitude, lng: longitude + step };
      case 'west': return { lat: latitude, lng: longitude - step };
    }
  }

  async fetchMeetings(latStart: number, longStart: number, step:number) {
    const stepFloat = step/100;
    const url = 'https://apps.jw.org/api/public/meeting-search/weekly-meetings';
    const directions = ['north', 'south', 'east', 'west'] as const;
    const results = new Array<{ name: string, city: string, state: string }>();

    for (const direction of directions) {
      const { lat, lng } = this.moveToNextBox(latStart, longStart, direction, stepFloat);
      const boundingBox = this.generateBoundingBox(lat, lng);

      const query = new URLSearchParams({
        lowerLatitude: boundingBox.lowerLatitude.toString(),
        lowerLongitude: boundingBox.lowerLongitude.toString(),
        upperLatitude: boundingBox.upperLatitude.toString(),
        upperLongitude: boundingBox.upperLongitude.toString(),
        searchLanguageCode: 'PTG',
      });

      try {
        const response = await firstValueFrom(
          this.httpService.get(`${url}?${query.toString()}`)
        );
        results.push(
          ...response.data.geoLocationList.map((geoLocation: any) => ({
            name: geoLocation.properties.orgName.split(' - ')[0],
            city: geoLocation.properties.orgName.split(' - ')[1].split(' ')[0],
            state: geoLocation.properties.orgName.split(' - ')[1].split(' ')[1],
          }))
        );
      } catch (error) {
        console.error(`Erro ao buscar dados para ${direction}`, error);
      }
    }

    return results;
  }
}
