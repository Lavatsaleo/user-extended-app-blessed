import { D2Api, D2UserSchema, SelectedPick, MetadataResponse } from "@eyeseetea/d2-api/2.34";
import _ from "lodash";
import { Future, FutureData } from "../../domain/entities/Future";
import { PaginatedResponse } from "../../domain/entities/PaginatedResponse";
import { User } from "../../domain/entities/User";
import { ListOptions, UserRepository } from "../../domain/repositories/UserRepository";
import { cache } from "../../utils/cache";
import { getD2APiFromInstance } from "../../utils/d2-api";
import { apiToFuture } from "../../utils/futures";
import { Instance } from "../entities/Instance";
import { UserModel } from "../models/UserModel";
import { ListFilters, ListFilterType } from "../../domain/repositories/UserRepository";

export class UserD2ApiRepository implements UserRepository {
    private api: D2Api;

    constructor(instance: Instance) {
        this.api = getD2APiFromInstance(instance);
    }

    @cache()
    public getCurrent(): FutureData<User> {
        return apiToFuture(this.api.currentUser.get({ fields })).map(user => this.mapUser(user));
    }

    public list(options: ListOptions): FutureData<PaginatedResponse<User>> {
        const { page, pageSize, search, sorting = { field: "firstName", order: "asc" }, filters } = options;
        const otherFilters = _.mapValues(filters, items => (items ? { [items[0]]: items[1] } : undefined));

        return apiToFuture(
            this.api.models.users.get({
                fields,
                page,
                pageSize,
                paging: true,
                filter: {
                    identifiable: search ? { token: search } : undefined,
                    ...otherFilters,
                },
                order: `${sorting.field}:${sorting.order}`,
            })
        ).map(({ objects, pager }) => ({
            pager,
            objects: objects.map(user => this.mapUser(user)),
        }));
    }

    public getById(id: string): FutureData<User> {
        return apiToFuture(this.api.models.users.get({ fields, filter: { id: { eq: id } } })).flatMap(({ objects }) => {
            const [user] = objects;
            if (!user) return Future.error(`User ${id} not found`);

            return Future.success(this.mapUser(user));
        });
    }

    private getFullUsers(options: ListOptions): FutureData<any[]> {
        const { page, pageSize, search, sorting = { field: "firstName", order: "asc" }, filters } = options;
        const otherFilters = _.mapValues(filters, items => (items ? { [items[0]]: items[1] } : undefined));

        const predictorData$ = apiToFuture(
            this.api.models.users.get({
                fields,
                page,
                pageSize,
                paging: false,
                filter: {
                    identifiable: search ? { token: search } : undefined,
                    ...otherFilters,
                },
                order: `${sorting.field}:${sorting.order}`,
            })
        );
        return predictorData$.map(({ objects }) => objects);
    }
    public save(usersToSave: User[]): FutureData<MetadataResponse> {
        const validations = usersToSave.map(user => UserModel.decode(user));
        const users = _.compact(validations.map(either => either.toMaybe().extract()));
        const errors = _.compact(validations.map(either => either.leftOrDefault("")));
        if (errors.length > 0) {
            return Future.error(errors.join("\n"));
        }
        const userIds = users.map(user => user.id);
        const listOptions = {
            filters: { id: ["in" as ListFilterType, userIds] } as ListFilters,
        };
        
        return this.getFullUsers(listOptions).flatMap(existingUsers => {
            const usersToSend = existingUsers.map((existingUser, index) => ({
                ...existingUser,
                organisationUnits: usersToSave[index]?.organisationUnits,
                dataViewOrganisationUnits: usersToSave[index]?.dataViewOrganisationUnits,
                userGroups: usersToSave[index]?.userGroups,
                email: usersToSave[index]?.email,
                firstName: usersToSave[index]?.firstName,
                surname: usersToSave[index]?.surname,
                userCredentials: {
                    ...existingUser.userCredentials,
                    disabled: usersToSave[index]?.disabled,
                    userRoles: usersToSave[index]?.userRoles,
                    username: usersToSave[index]?.username,
                },
            }));
            return apiToFuture(this.api.metadata.post({ users: usersToSend })).map(data => data);
        });
    }

    private mapUser(user: D2ApiUser): User {
        return {
            id: user.id,
            name: user.displayName,
            firstName: user.firstName,
            surname: user.surname,
            email: user.email,
            lastUpdated: user.lastUpdated,
            created: user.created,
            userGroups: user.userGroups,
            username: user.userCredentials.username,
            userRoles: user.userCredentials.userRoles,
            lastLogin: user.userCredentials.lastLogin,
            disabled: user.userCredentials.disabled,
            organisationUnits: user.organisationUnits,
            dataViewOrganisationUnits: user.dataViewOrganisationUnits,
            access: user.access,
        };
    }
}

const fields = {
    id: true,
    displayName: true,
    firstName: true,
    surname: true,
    email: true,
    lastUpdated: true,
    created: true,
    userGroups: { id: true, name: true },
    userCredentials: {
        username: true,
        userRoles: { id: true, name: true, authorities: true },
        lastLogin: true,
        disabled: true,
    },
    organisationUnits: { id: true, name: true },
    dataViewOrganisationUnits: { id: true, name: true },
    access: true,
} as const;

type D2ApiUser = SelectedPick<D2UserSchema, typeof fields>;
